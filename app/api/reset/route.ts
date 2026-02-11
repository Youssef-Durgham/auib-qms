import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Ticket, Counter } from '@/app/lib/models';
import { sseManager } from '@/app/lib/sse';

export async function POST() {
  await connectDB();

  await Ticket.updateMany({ status: { $in: ['waiting', 'serving'] } }, { status: 'cancelled' });
  await Counter.updateMany({}, { currentTicket: null });

  sseManager.broadcast('queue-reset', {});

  return NextResponse.json({ message: 'Queue reset successfully' });
}
