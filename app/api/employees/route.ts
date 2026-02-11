import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Employee } from '@/app/lib/models';
import { getEmployeeFromRequest } from '@/app/lib/auth';
import bcrypt from 'bcryptjs';

export async function GET(req: NextRequest) {
  const admin = await getEmployeeFromRequest(req);
  if (!admin || admin.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  const employees = await Employee.find({}, '-password').sort({ counterNumber: 1 });
  return NextResponse.json({ employees });
}

export async function POST(req: NextRequest) {
  const admin = await getEmployeeFromRequest(req);
  if (!admin || admin.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  const { username, password, name, counterNumber, role } = await req.json();

  if (!username || !password || !name || !counterNumber) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  }

  const existing = await Employee.findOne({ $or: [{ username }, { counterNumber }] });
  if (existing) {
    return NextResponse.json({ error: 'Username or counter number already taken' }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const employee = await Employee.create({
    username,
    password: hashedPassword,
    name,
    counterNumber,
    role: role || 'employee',
    active: true,
  });

  return NextResponse.json({
    employee: { id: employee._id, username, name, counterNumber, role: employee.role, active: true },
  });
}

export async function PUT(req: NextRequest) {
  const admin = await getEmployeeFromRequest(req);
  if (!admin || admin.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  const { id, username, password, name, counterNumber, role, active } = await req.json();

  const update: Record<string, unknown> = {};
  if (username) update.username = username;
  if (name) update.name = name;
  if (counterNumber !== undefined) update.counterNumber = counterNumber;
  if (role) update.role = role;
  if (active !== undefined) update.active = active;
  if (password) update.password = await bcrypt.hash(password, 10);

  const employee = await Employee.findByIdAndUpdate(id, update, { new: true }).select('-password');
  if (!employee) {
    return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
  }

  return NextResponse.json({ employee });
}

export async function DELETE(req: NextRequest) {
  const admin = await getEmployeeFromRequest(req);
  if (!admin || admin.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectDB();
  const { id } = await req.json();
  await Employee.findByIdAndDelete(id);
  return NextResponse.json({ message: 'Employee deleted' });
}
