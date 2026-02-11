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
    return NextResponse.json({ message: 'No ticket to recall' }, { status: 400 });
  }

  // Increment recall count
  const ticket = await Ticket.findOneAndUpdate(
    { number: counter.currentTicket, createdAt: { $gte: start, $lt: end } },
    { $inc: { recallCount: 1 } },
    { new: true }
  );

  if (!ticket) {
    return NextResponse.json({ message: 'Ticket not found' }, { status: 404 });
  }

  // Auto-cancel after 3 recalls
  if (ticket.recallCount >= 3) {
    ticket.status = 'cancelled';
    ticket.cancelReason = 'no-show-recall-limit';
    await ticket.save();
    counter.currentTicket = null;
    await counter.save();

    const waitingCount = await Ticket.countDocuments({ status: 'waiting', createdAt: { $gte: start, $lt: end } });
    const servedCount = await Ticket.countDocuments({ status: 'served', createdAt: { $gte: start, $lt: end } });

    sseManager.broadcast('ticket-auto-cancelled', {
      ticketNumber: ticket.number,
      counterNumber,
      reason: 'recall-limit',
      waitingCount,
      servedCount,
    });

    return NextResponse.json({ ticketNumber: ticket.number, counterNumber, autoCancelled: true, recallCount: ticket.recallCount });
  }

  sseManager.broadcast('ticket-recalled', {
    ticketNumber: counter.currentTicket,
    counterNumber,
    recallCount: ticket.recallCount,
  });

  return NextResponse.json({ ticketNumber: counter.currentTicket, counterNumber, recallCount: ticket.recallCount });
}
