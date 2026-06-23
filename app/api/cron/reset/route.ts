import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Ticket, Counter, Settings } from '@/app/lib/models';
import { sseManager } from '@/app/lib/sse';
import { getTodayKey } from '@/app/lib/helpers';

export async function POST() {
  await connectDB();

  const now = new Date();
  // Local-day key (not UTC) so the daily reset fires at the configured local
  // time. Using UTC here delayed the reset by the timezone offset (e.g. +3h),
  // which let yesterday's queue linger into the new local day.
  const todayStr = getTodayKey();

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
