import { connectDB } from './mongodb';
import { Session, Employee } from './models';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function getEmployeeFromRequest(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  
  await connectDB();
  const session = await Session.findOne({ token });
  if (!session) return null;
  
  const employee = await Employee.findById(session.employeeId);
  if (!employee || !employee.active) return null;
  
  return employee;
}
