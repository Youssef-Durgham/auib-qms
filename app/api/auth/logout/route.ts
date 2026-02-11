import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Session } from '@/app/lib/models';

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (token) {
    await connectDB();
    await Session.deleteOne({ token });
  }
  return NextResponse.json({ message: 'Logged out' });
}
