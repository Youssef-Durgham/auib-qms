import { readFile } from 'fs/promises';
import { join } from 'path';
import { NextResponse } from 'next/server';

export async function GET() {
  const filePath = join(process.cwd(), 'print-agent', 'auib-agent-check.bat');
  const content = await readFile(filePath);
  return new NextResponse(new Uint8Array(content), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="auib-agent-check.bat"',
      'Cache-Control': 'no-store',
    },
  });
}
