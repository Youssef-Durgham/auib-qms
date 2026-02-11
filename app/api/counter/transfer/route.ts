import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Ticket, Counter } from '@/app/lib/models';
import { sseManager } from '@/app/lib/sse';
import { getTodayRange } from '@/app/lib/helpers';

export async function POST(req: NextRequest) {
  await connectDB();
  const { counterNumber, targetCounter } = await req.json();
  const { start, end } = getTodayRange();

  const counter = await Counter.findOne({ number: counterNumber });
  if (!counter?.currentTicket) {
    return NextResponse.json({ message: 'No ticket to transfer' }, { status: 400 });
  }

  const ticket = await Ticket.findOneAndUpdate(
    { number: counter.currentTicket, createdAt: { $gte: start, $lt: end } },
    { status: 'serving', counterNumber: targetCounter, servedAt: new Date() },
    { new: true }
  );

  // Clear source counter
  counter.currentTicket = null;
  await counter.save();

  // Update target counter
  await Counter.findOneAndUpdate(
    { number: targetCounter },
    { currentTicket: ticket?.number },
    { upsert: true }
  );

  sseManager.broadcast('ticket-transferred', {
    ticket,
    fromCounter: counterNumber,
    toCounter: targetCounter,
  });

  sseManager.broadcast('ticket-called', {
    ticket,
    counterNumber: targetCounter,
    waitingCount: await Ticket.countDocuments({ status: 'waiting', createdAt: { $gte: start, $lt: end } }),
    servedCount: await Ticket.countDocuments({ status: 'served', createdAt: { $gte: start, $lt: end } }),
  });

  return NextResponse.json({ message: 'Ticket transferred', ticket });
}
