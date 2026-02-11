import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Ticket, Counter, Settings } from '@/app/lib/models';
import { sseManager } from '@/app/lib/sse';

export async function POST() {
  await connectDB();

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Check last reset date
  const lastReset = await Settings.findOne({ key: 'lastResetDate' });
  if (lastReset?.value === todayStr) {
    return NextResponse.json({ message: 'Already reset today', reset: false });
  }

  // Check auto-reset setting
  const autoResetSetting = await Settings.findOne({ key: 'autoResetTime' });
  const autoResetTime = autoResetSetting?.value || '00:00';
  const [h, m] = autoResetTime.split(':').map(Number);

  if (now.getHours() < h || (now.getHours() === h && now.getMinutes() < m)) {
    return NextResponse.json({ message: 'Not time yet', reset: false });
  }

  // Perform reset
  await Ticket.updateMany({ status: { $in: ['waiting', 'serving'] } }, { status: 'cancelled' });
  await Counter.updateMany({}, { currentTicket: null });
  await Settings.findOneAndUpdate({ key: 'lastResetDate' }, { key: 'lastResetDate', value: todayStr }, { upsert: true });

  sseManager.broadcast('queue-reset', {});

  return NextResponse.json({ message: 'Queue reset for new day', reset: true });
}

export async function GET() {
  // Allow GET for easy checking / cron job trigger
  return POST();
}
