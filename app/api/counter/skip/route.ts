import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Ticket, Counter } from '@/app/lib/models';
import { sseManager } from '@/app/lib/sse';
import { getTodayRange } from '@/app/lib/helpers';
import { getEmployeeFromRequest } from '@/app/lib/auth';

export async function POST(req: NextRequest) {
  await connectDB();
  const employee = await getEmployeeFromRequest(req);
  if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const counterNumber = employee.counterNumber;
  const { start, end } = getTodayRange();

  const counter = await Counter.findOne({ number: counterNumber });
  if (!counter?.currentTicket) {
    return NextResponse.json({ message: 'No ticket to skip' }, { status: 400 });
  }

  // Cancel the current ticket
  await Ticket.findOneAndUpdate(
    { number: counter.currentTicket, createdAt: { $gte: start, $lt: end } },
    { status: 'cancelled', cancelReason: 'no-show', completedAt: new Date() }
  );

  counter.currentTicket = null;
  await counter.save();

  const waitingCount = await Ticket.countDocuments({ status: 'waiting', createdAt: { $gte: start, $lt: end } });
  const servedCount = await Ticket.countDocuments({ status: 'served', createdAt: { $gte: start, $lt: end } });

  sseManager.broadcast('ticket-skipped', { counterNumber, waitingCount, servedCount });

  return NextResponse.json({ message: 'Ticket skipped', waitingCount, servedCount });
}
