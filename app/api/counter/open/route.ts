import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Counter } from '@/app/lib/models';
import { getEmployeeFromRequest } from '@/app/lib/auth';

export async function POST(req: NextRequest) {
  await connectDB();
  const employee = await getEmployeeFromRequest(req);
  if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const counterNumber = employee.counterNumber;

  const counter = await Counter.findOneAndUpdate(
    { number: counterNumber },
    { status: 'open', employeeName: employee.name || `Counter ${counterNumber}` },
    { upsert: true, new: true }
  );

  return NextResponse.json({ counter });
}
