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

  // Sliding expiry: refresh the session so a counter that stays open and is actively
  // used (or kept alive by its heartbeat) never hits the 24h TTL mid-shift. Throttled
  // to at most one write per 30 min so this doesn't add a DB write to every request.
  const THIRTY_MIN = 30 * 60 * 1000;
  if (Date.now() - new Date(session.createdAt).getTime() > THIRTY_MIN) {
    await Session.updateOne({ _id: session._id }, { $set: { createdAt: new Date() } });
  }

  return employee;
}
