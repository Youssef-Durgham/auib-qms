import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Ticket } from '@/app/lib/models';
import { sseManager } from '@/app/lib/sse';
import { getTodayRange } from '@/app/lib/helpers';

export async function GET() {
  await connectDB();
  const { start, end } = getTodayRange();
  
  const tickets = await Ticket.find({ createdAt: { $gte: start, $lt: end } }).sort({ number: 1 });
  const waiting = tickets.filter((t) => t.status === 'waiting');
  const serving = tickets.filter((t) => t.status === 'serving');
  const served = tickets.filter((t) => t.status === 'served');

  // Calculate average serve time from completed tickets
  let avgServeTime = 5; // default 5 min
  const completedWithTimes = served.filter((t) => t.servedAt && t.completedAt);
  if (completedWithTimes.length > 0) {
    const totalMs = completedWithTimes.reduce((sum, t) => {
      return sum + (new Date(t.completedAt!).getTime() - new Date(t.servedAt!).getTime());
    }, 0);
    avgServeTime = Math.round(totalMs / completedWithTimes.length / 60000);
    if (avgServeTime < 1) avgServeTime = 1;
  }

  return NextResponse.json({ tickets, waiting, serving, served, total: tickets.length, avgServeTime });
}

export async function POST(req: NextRequest) {
  await connectDB();
  const { start, end } = getTodayRange();
  const body = await req.json().catch(() => ({}));
  const category = body.category || 'General Inquiry';

  const lastTicket = await Ticket.findOne({ createdAt: { $gte: start, $lt: end } }).sort({ number: -1 });
  const nextNumber = lastTicket ? lastTicket.number + 1 : 1;

  const ticket = await Ticket.create({ number: nextNumber, status: 'waiting', category });
  
  const waitingCount = await Ticket.countDocuments({ status: 'waiting', createdAt: { $gte: start, $lt: end } });

  // Calculate estimated wait
  const served = await Ticket.find({ status: 'served', createdAt: { $gte: start, $lt: end }, servedAt: { $ne: null }, completedAt: { $ne: null } });
  let avgServeTime = 5;
  if (served.length > 0) {
    const totalMs = served.reduce((sum, t) => sum + (new Date(t.completedAt!).getTime() - new Date(t.servedAt!).getTime()), 0);
    avgServeTime = Math.round(totalMs / served.length / 60000);
    if (avgServeTime < 1) avgServeTime = 1;
  }
  const estimatedWait = waitingCount * avgServeTime;
  
  sseManager.broadcast('ticket-created', { ticket, waitingCount });

  return NextResponse.json({ ticket, position: waitingCount, estimatedWait });
}
