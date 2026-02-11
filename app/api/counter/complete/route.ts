import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Ticket, Counter, Employee } from '@/app/lib/models';
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

  const ticket = await Ticket.findOneAndUpdate(
    { number: counter.currentTicket, createdAt: { $gte: start, $lt: end } },
    { status: 'served', completedAt: new Date() },
    { new: true }
  );

  // Track employee performance
  if (ticket?.servedAt && ticket?.completedAt) {
    const serveTimeMs = new Date(ticket.completedAt).getTime() - new Date(ticket.servedAt).getTime();
    await Employee.findOneAndUpdate(
      { counterNumber },
      { $inc: { ticketsServed: 1, totalServeTime: serveTimeMs } }
    );
  }

  counter.currentTicket = null;
  await counter.save();

  const waitingCount = await Ticket.countDocuments({ status: 'waiting', createdAt: { $gte: start, $lt: end } });
  const servedCount = await Ticket.countDocuments({ status: 'served', createdAt: { $gte: start, $lt: end } });

  sseManager.broadcast('ticket-completed', {
    counterNumber,
    waitingCount,
    servedCount,
    ticket: ticket ? { number: ticket.number, category: ticket.category, servedAt: ticket.servedAt, completedAt: ticket.completedAt, createdAt: ticket.createdAt } : null,
  });

  return NextResponse.json({ message: 'Ticket completed', waitingCount, servedCount, ticket });
}
