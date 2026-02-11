import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Employee } from '@/app/lib/models';
import bcrypt from 'bcryptjs';

export async function POST() {
  await connectDB();

  const existing = await Employee.findOne({ username: 'admin' });
  if (existing) {
    return NextResponse.json({ message: 'Admin already exists' });
  }

  const hashedPassword = await bcrypt.hash('admin123', 10);
  await Employee.create({
    username: 'admin',
    password: hashedPassword,
    name: 'Administrator',
    counterNumber: 0,
    role: 'admin',
    active: true,
  });

  return NextResponse.json({ message: 'Admin account seeded successfully' });
}
