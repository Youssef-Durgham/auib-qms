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

  return NextResponse.json({ tickets, waiting, serving, served, total: tickets.length });
}

export async function POST(req: NextRequest) {
  await connectDB();
  const { start, end } = getTodayRange();
  const body = await req.json().catch(() => ({}));
  const serviceType = body.serviceType || 'General';

  const lastTicket = await Ticket.findOne({ createdAt: { $gte: start, $lt: end } }).sort({ number: -1 });
  const nextNumber = lastTicket ? lastTicket.number + 1 : 1;

  const ticket = await Ticket.create({ number: nextNumber, status: 'waiting', serviceType });
  
  const waitingCount = await Ticket.countDocuments({ status: 'waiting', createdAt: { $gte: start, $lt: end } });
  
  sseManager.broadcast('ticket-created', { ticket, waitingCount });

  return NextResponse.json({ ticket, position: waitingCount, estimatedWait: waitingCount * 5 });
}
