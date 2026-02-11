import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '../../lib/mongodb';
import { Settings, Session, Employee } from '../../lib/models';

async function verifyAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth) return false;
  const token = auth.replace('Bearer ', '');
  await connectDB();
  const session = await Session.findOne({ token });
  if (!session) return false;
  const emp = await Employee.findById(session.employeeId);
  return emp?.role === 'admin';
}

export async function GET() {
  await connectDB();
  const settings = await Settings.find({});
  const obj: Record<string, string> = {};
  settings.forEach((s) => { obj[s.key] = s.value; });
  return NextResponse.json(obj);
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { key, value } = body;
  if (!key || value === undefined) {
    return NextResponse.json({ error: 'key and value required' }, { status: 400 });
  }
  await connectDB();
  await Settings.findOneAndUpdate({ key }, { key, value }, { upsert: true });
  return NextResponse.json({ success: true });
}
