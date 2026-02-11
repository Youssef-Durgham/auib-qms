import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '../../lib/mongodb';
import { Session, Employee } from '../../lib/models';
import { writeFile, mkdir, unlink, readdir } from 'fs/promises';
import path from 'path';

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

const VIDEOS_DIR = path.join(process.cwd(), 'public', 'videos');

// GET — list uploaded videos
export async function GET() {
  try {
    await mkdir(VIDEOS_DIR, { recursive: true });
    const files = await readdir(VIDEOS_DIR);
    const videoFiles = files.filter(f => /\.(mp4|webm|mov|avi|mkv)$/i.test(f));
    const videos = videoFiles.map(f => ({
      name: f,
      url: `/videos/${f}`,
      filename: f,
    }));
    return NextResponse.json({ videos });
  } catch {
    return NextResponse.json({ videos: [] });
  }
}

// POST — upload a video
export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('video') as File;
    if (!file) {
      return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
    }

    // Validate file type
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|webm|mov|avi|mkv)$/i)) {
      return NextResponse.json({ error: 'Invalid video format. Use MP4, WebM, MOV, or AVI.' }, { status: 400 });
    }

    await mkdir(VIDEOS_DIR, { recursive: true });

    // Clean filename
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(VIDEOS_DIR, safeName);

    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    return NextResponse.json({
      success: true,
      video: { name: safeName, url: `/videos/${safeName}`, filename: safeName },
    });
  } catch (e) {
    console.error('Upload error:', e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// DELETE — remove a video
export async function DELETE(req: NextRequest) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { filename } = await req.json();
    if (!filename) return NextResponse.json({ error: 'Filename required' }, { status: 400 });

    // Prevent path traversal
    const safeName = path.basename(filename);
    const filePath = path.join(VIDEOS_DIR, safeName);

    await unlink(filePath);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
