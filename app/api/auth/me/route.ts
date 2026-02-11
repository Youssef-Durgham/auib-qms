import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeFromRequest } from '@/app/lib/auth';

export async function GET(req: NextRequest) {
  const employee = await getEmployeeFromRequest(req);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    id: employee._id,
    username: employee.username,
    name: employee.name,
    counterNumber: employee.counterNumber,
    role: employee.role,
  });
}
