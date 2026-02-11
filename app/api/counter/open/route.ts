import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Counter } from '@/app/lib/models';

export async function POST(req: NextRequest) {
  await connectDB();
  const { counterNumber, employeeName } = await req.json();

  const counter = await Counter.findOneAndUpdate(
    { number: counterNumber },
    { status: 'open', employeeName: employeeName || `Counter ${counterNumber}` },
    { upsert: true, new: true }
  );

  return NextResponse.json({ counter });
}
