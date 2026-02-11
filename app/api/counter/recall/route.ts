import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Counter } from '@/app/lib/models';
import { sseManager } from '@/app/lib/sse';

export async function POST(req: NextRequest) {
  await connectDB();
  const { counterNumber } = await req.json();

  const counter = await Counter.findOne({ number: counterNumber });
  if (!counter?.currentTicket) {
    return NextResponse.json({ message: 'No ticket to recall' }, { status: 400 });
  }

  sseManager.broadcast('ticket-recalled', {
    ticketNumber: counter.currentTicket,
    counterNumber,
  });

  return NextResponse.json({ ticketNumber: counter.currentTicket, counterNumber });
}
