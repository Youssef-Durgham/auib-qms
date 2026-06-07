import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/mongodb';
import { Employee } from '@/app/lib/models';
import bcrypt from 'bcryptjs';

export async function POST() {
  await connectDB();

  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';

  const existing = await Employee.findOne({ username });
  if (existing) {
    return NextResponse.json({ message: 'Admin already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await Employee.create({
    username,
    password: hashedPassword,
    name: 'Administrator',
    counterNumber: 0,
    role: 'admin',
    active: true,
  });

  return NextResponse.json({ message: 'Admin account seeded successfully', username });
}
