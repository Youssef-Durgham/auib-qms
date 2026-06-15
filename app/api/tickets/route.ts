import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Ticket, Settings } from '@/app/lib/models';
import { sseManager } from '@/app/lib/sse';
import { getTodayRange, getTodayKey, normalizeCategories, ticketLabel, limitWindowStart } from '@/app/lib/helpers';

function parseResetMap(value: string | undefined): Record<string, string> {
  if (!value) return {};
  try { return JSON.parse(value); } catch { return {}; }
}

// Average serve time in minutes, robust against outliers. A serve duration
// over 60 min almost always means a counter forgot to press Complete, so we
// drop those; the result is clamped to 1..30 min to keep wait estimates sane.
function computeAvgServeTime(served: { servedAt: Date | null; completedAt: Date | null }[]): number {
  const mins = served
    .filter((t) => t.servedAt && t.completedAt)
    .map((t) => (new Date(t.completedAt!).getTime() - new Date(t.servedAt!).getTime()) / 60000)
    .filter((m) => m > 0 && m <= 60);
  if (mins.length === 0) return 5;
  const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
  return Math.min(30, Math.max(1, avg));
}

export async function GET() {
  await connectDB();
  const { start, end } = getTodayRange();

  const tickets = await Ticket.find({ createdAt: { $gte: start, $lt: end } }).sort({ number: 1 });
  const waiting = tickets.filter((t) => t.status === 'waiting');
  const serving = tickets.filter((t) => t.status === 'serving');
  const served = tickets.filter((t) => t.status === 'served');

  // Average serve time from completed tickets. Ignore outliers (e.g. a counter
  // that forgot to press Complete, leaving a ticket "open" for hours) and cap
  // the result so the estimated-wait number stays realistic.
  const avgServeTime = computeAvgServeTime(served);

  // Recent calls feed for the display board: only tickets that finished being
  // served (status 'served'), newest first. The one currently being served is
  // shown in the big "Now Serving" panel, not in this history table.
  const recentCalls = tickets
    .filter((t) => t.status === 'served' && t.counterNumber != null && t.servedAt)
    .sort((a, b) => new Date(b.servedAt!).getTime() - new Date(a.servedAt!).getTime())
    .slice(0, 12)
    .map((t) => ({ label: ticketLabel(t), counterNumber: t.counterNumber, category: t.category }));

  // Per-type status (issued count vs. daily limit) so the kiosk can grey out
  // services that have hit their cap.
  const settingsRows = await Settings.find({ key: { $in: ['categories', 'limitResetAt'] } });
  const cats = normalizeCategories(settingsRows.find((s) => s.key === 'categories')?.value);
  const resetMap = parseResetMap(settingsRows.find((s) => s.key === 'limitResetAt')?.value);
  const categoryStatus = cats.map((c) => {
    const winStart = limitWindowStart(start, resetMap, c.name);
    const issued = tickets.filter(
      (t) => t.category === c.name && t.status !== 'cancelled' && new Date(t.createdAt) >= winStart,
    ).length;
    const closed = c.limit > 0 && issued >= c.limit;
    return {
      name: c.name,
      nameAr: c.nameAr,
      prefix: c.prefix,
      limit: c.limit,
      issued,
      remaining: c.limit > 0 ? Math.max(0, c.limit - issued) : null,
      closed,
      msg: c.msg,
    };
  });

  return NextResponse.json({ tickets, waiting, serving, served, total: tickets.length, avgServeTime, recentCalls, categoryStatus });
}

export async function POST(req: NextRequest) {
  await connectDB();
  const { start, end } = getTodayRange();
  const dateKey = getTodayKey();
  const body = await req.json().catch(() => ({}));
  const category = body.category || 'General Inquiry';

  // Resolve this category's config (prefix + daily limit) and the start number.
  const settingsRows = await Settings.find({ key: { $in: ['categories', 'ticketStart', 'limitResetAt'] } });
  const cats = normalizeCategories(settingsRows.find((s) => s.key === 'categories')?.value);
  const resetMap = parseResetMap(settingsRows.find((s) => s.key === 'limitResetAt')?.value);
  const globalStart = Math.max(1, parseInt(settingsRows.find((s) => s.key === 'ticketStart')?.value || '') || 1000);
  const cat = cats.find((c) => c.name === category);
  const prefix = cat?.prefix || '';
  const limit = cat?.limit || 0;
  // Per-category start overrides the global default when set.
  const startNum = cat?.start && cat.start > 0 ? cat.start : globalStart;

  // Enforce the per-type daily limit. Cancelled tickets (resets / no-shows) free
  // their slot, so we count only still-valid tickets of this category today.
  if (limit > 0) {
    const winStart = limitWindowStart(start, resetMap, category);
    const issued = await Ticket.countDocuments({
      category,
      status: { $ne: 'cancelled' },
      createdAt: { $gte: winStart, $lt: end },
    });
    if (issued >= limit) {
      const reason = cat?.msg?.trim()
        || `This service has reached today's limit of ${limit}. Please come back tomorrow.`;
      return NextResponse.json({ error: 'category-closed', closed: true, reason, category }, { status: 409 });
    }
  }

  // Allocate both the global daily number (internal ordering) and the per-type
  // sequence (display label), retrying on the unique-index race.
  let ticket;
  for (let attempt = 0; attempt < 5; attempt++) {
    const lastTicket = await Ticket.findOne({ createdAt: { $gte: start, $lt: end } }).sort({ number: -1 });
    const nextNumber = lastTicket ? lastTicket.number + 1 : 1;
    const lastOfType = await Ticket.findOne({ category, createdAt: { $gte: start, $lt: end } }).sort({ typeSeq: -1 });
    // Each type's numbering for the day begins at its configured start (e.g.
    // Registration 1000, Finance 2000). If the type already has equal/higher
    // numbers today, continue above them. Using max() means editing the start
    // mid-day takes effect immediately — the sequence jumps up to the new start
    // instead of staying stuck in the old range.
    const nextSeq = Math.max(startNum, (lastOfType?.typeSeq || 0) + 1);
    try {
      ticket = await Ticket.create({ number: nextNumber, dateKey, prefix, typeSeq: nextSeq, status: 'waiting', category });
      break;
    } catch (err: unknown) {
      // Duplicate key (E11000) → another request won the race; recompute and retry.
      if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) continue;
      throw err;
    }
  }
  if (!ticket) {
    return NextResponse.json({ error: 'Could not allocate a ticket number, please retry' }, { status: 503 });
  }

  const waitingCount = await Ticket.countDocuments({ status: 'waiting', createdAt: { $gte: start, $lt: end } });
  // Position = place in this service's own line (people ahead in the same
  // category), not the global queue — different counters serve different
  // services, so a global position would be misleading.
  const position = await Ticket.countDocuments({ status: 'waiting', category, createdAt: { $gte: start, $lt: end } });

  // Calculate estimated wait based on this service's line.
  const served = await Ticket.find({ status: 'served', createdAt: { $gte: start, $lt: end }, servedAt: { $ne: null }, completedAt: { $ne: null } });
  const avgServeTime = computeAvgServeTime(served);
  const estimatedWait = position * avgServeTime;

  sseManager.broadcast('ticket-created', { ticket, waitingCount });

  return NextResponse.json({ ticket, position, estimatedWait });
}
