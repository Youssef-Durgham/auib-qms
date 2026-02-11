import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Employee, Session } from '@/app/lib/models';
import { generateToken } from '@/app/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  await connectDB();
  const { username, password } = await req.json();

  const employee = await Employee.findOne({ username });
  if (!employee || !employee.active) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, employee.password);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = generateToken();
  await Session.create({ token, employeeId: employee._id });

  return NextResponse.json({
    token,
    employee: {
      id: employee._id,
      username: employee.username,
      name: employee.name,
      counterNumber: employee.counterNumber,
      role: employee.role,
    },
  });
}
