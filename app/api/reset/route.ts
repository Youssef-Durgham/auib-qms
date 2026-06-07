import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Ticket, Counter } from '@/app/lib/models';
import { sseManager } from '@/app/lib/sse';
import { getEmployeeFromRequest } from '@/app/lib/auth';

export async function POST(req: NextRequest) {
  await connectDB();
  const employee = await getEmployeeFromRequest(req);
  if (!employee || employee.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await Ticket.updateMany({ status: { $in: ['waiting', 'serving'] } }, { status: 'cancelled' });
  await Counter.updateMany({}, { currentTicket: null });

  sseManager.broadcast('queue-reset', {});

  return NextResponse.json({ message: 'Queue reset successfully' });
}
