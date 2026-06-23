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

  // Complete current ticket if any
  const counter = await Counter.findOne({ number: counterNumber });
  if (counter?.currentTicket) {
    await Ticket.findOneAndUpdate(
      { number: counter.currentTicket, createdAt: { $gte: start, $lt: end } },
      { status: 'served', completedAt: new Date() }
    );
  }

  // Get next waiting ticket, restricted to the services this employee is allowed
  // to handle. The authoritative assignment lives on the employee
  // (employee.categories); fall back to the counter's categories only if the
  // employee has none. Without this, an employee assigned e.g. "Enrollment
  // Services" would still be handed a "Student Finance" ticket.
  const allowedCategories = (employee.categories && employee.categories.length > 0)
    ? employee.categories
    : (counter?.categories || []);
  const query: Record<string, unknown> = { status: 'waiting', createdAt: { $gte: start, $lt: end } };
  if (allowedCategories.length > 0) {
    query.category = { $in: allowedCategories };
  }

  const nextTicket = await Ticket.findOneAndUpdate(
    query,
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
