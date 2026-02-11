import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Ticket, Counter } from '@/app/lib/models';
import { sseManager } from '@/app/lib/sse';
import { getTodayRange } from '@/app/lib/helpers';

export async function POST(req: NextRequest) {
  await connectDB();
  const { counterNumber } = await req.json();
  const { start, end } = getTodayRange();

  // Complete current ticket if any
  const counter = await Counter.findOne({ number: counterNumber });
  if (counter?.currentTicket) {
    await Ticket.findOneAndUpdate(
      { number: counter.currentTicket, createdAt: { $gte: start, $lt: end } },
      { status: 'served', completedAt: new Date() }
    );
  }

  // Get next waiting ticket
  const nextTicket = await Ticket.findOneAndUpdate(
    { status: 'waiting', createdAt: { $gte: start, $lt: end } },
    { status: 'serving', counterNumber, servedAt: new Date() },
    { sort: { number: 1 }, new: true }
  );

  if (!nextTicket) {
    if (counter) {
      counter.currentTicket = null;
      await counter.save();
    }
    return NextResponse.json({ message: 'No tickets waiting', ticket: null });
  }

  // Update counter
  await Counter.findOneAndUpdate(
    { number: counterNumber },
    { currentTicket: nextTicket.number },
    { upsert: true }
  );

  const waitingCount = await Ticket.countDocuments({ status: 'waiting', createdAt: { $gte: start, $lt: end } });
  const servedCount = await Ticket.countDocuments({ status: 'served', createdAt: { $gte: start, $lt: end } });

  sseManager.broadcast('ticket-called', {
    ticket: nextTicket,
    counterNumber,
    waitingCount,
    servedCount,
  });

  return NextResponse.json({ ticket: nextTicket, waitingCount, servedCount });
}
