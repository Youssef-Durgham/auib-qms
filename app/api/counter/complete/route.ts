import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Ticket, Counter } from '@/app/lib/models';
import { sseManager } from '@/app/lib/sse';
import { getTodayRange } from '@/app/lib/helpers';

export async function POST(req: NextRequest) {
  await connectDB();
  const { counterNumber } = await req.json();
  const { start, end } = getTodayRange();

  const counter = await Counter.findOne({ number: counterNumber });
  if (!counter?.currentTicket) {
    return NextResponse.json({ message: 'No ticket to complete' }, { status: 400 });
  }

  await Ticket.findOneAndUpdate(
    { number: counter.currentTicket, createdAt: { $gte: start, $lt: end } },
    { status: 'served', completedAt: new Date() }
  );

  counter.currentTicket = null;
  await counter.save();

  const waitingCount = await Ticket.countDocuments({ status: 'waiting', createdAt: { $gte: start, $lt: end } });
  const servedCount = await Ticket.countDocuments({ status: 'served', createdAt: { $gte: start, $lt: end } });

  sseManager.broadcast('ticket-completed', { counterNumber, waitingCount, servedCount });

  return NextResponse.json({ message: 'Ticket completed', waitingCount, servedCount });
}
