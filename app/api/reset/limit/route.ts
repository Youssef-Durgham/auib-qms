import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Settings } from '@/app/lib/models';
import { sseManager } from '@/app/lib/sse';
import { getEmployeeFromRequest } from '@/app/lib/auth';

// Reset a service's daily limit counter without touching ticket history. We
// stamp a "count from now" timestamp into the `limitResetAt` map: per-category
// when a name is given, or under the '*' wildcard to reset every service. The
// ticket endpoints count only tickets created at/after this timestamp, so the
// service reopens immediately. The stamp naturally expires at the next day's
// midnight (see limitWindowStart).
export async function POST(req: NextRequest) {
  await connectDB();
  const employee = await getEmployeeFromRequest(req);
  if (!employee || employee.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const category: string | undefined = typeof body.category === 'string' ? body.category : undefined;
  const now = new Date().toISOString();

  const row = await Settings.findOne({ key: 'limitResetAt' });
  let map: Record<string, string> = {};
  if (row?.value) { try { map = JSON.parse(row.value); } catch { map = {}; } }

  if (category && category !== '*') {
    map[category] = now;
  } else {
    // Reset every service (including any not currently configured).
    map = { '*': now };
  }

  await Settings.findOneAndUpdate(
    { key: 'limitResetAt' },
    { key: 'limitResetAt', value: JSON.stringify(map) },
    { upsert: true }
  );

  // Nudge kiosks to re-read category status (closed/remaining).
  sseManager.broadcast('ticket-created', {});

  return NextResponse.json({ success: true, reset: category || 'all' });
}
