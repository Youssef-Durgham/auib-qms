import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { randomBytes, createHash } from 'crypto';
import { tmpdir } from 'os';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

// Server-side TTS for the display. The lobby display runs in an Android WebView
// (FreeKiosk) which doesn't support the browser Web Speech API, so the page can't
// speak announcements itself. Instead it asks this endpoint to synthesize the
// phrase with the Windows SAPI engine and plays the returned WAV through Web Audio.
export const dynamic = 'force-dynamic';

const CACHE_DIR = path.join(tmpdir(), 'auib-tts-cache');

// PowerShell that reads an SSML document from a file (never interpolated into
// code, so no command injection) and writes a WAV to the output path with the
// Zira voice. SpeakSsml lets us add human-like pauses (<break>) and gentler
// prosody so the announcement doesn't sound flat/robotic.
const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$text = [System.IO.File]::ReadAllText($env:TTS_TEXT_FILE)
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = 0
try {
  $voice = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'en*' }
  $zira = $voice | Where-Object { $_.VoiceInfo.Name -like '*Zira*' } | Select-Object -First 1
  $pick = if ($zira) { $zira } else { $voice | Select-Object -First 1 }
  if ($pick) { $s.SelectVoice($pick.VoiceInfo.Name) }
} catch {}
$s.SetOutputToWaveFile($env:TTS_OUT_FILE)
if ($text.TrimStart().StartsWith('<speak')) { $s.SpeakSsml($text) } else { $s.Speak($text) }
$s.Dispose()
`;

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string
  ));
}

// Turn a plain announcement into SSML with natural, human-like phrasing:
// a gentle overall pace, a longer beat after sentences, a short beat after
// commas, and a brief pause before each number so digits land clearly.
function toSsml(text: string): string {
  let t = escapeXml(text);
  t = t.replace(/\.(\s|$)/g, ".<break time='550ms'/>$1");
  t = t.replace(/,(\s|$)/g, ",<break time='320ms'/>$1");
  // Small pause before a number (ticket / counter) for emphasis & clarity.
  t = t.replace(/(\s)(\d)/g, "$1<break time='180ms'/>$2");
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>`
    + `<prosody rate='-8%' pitch='+2%'>${t}</prosody></speak>`;
}

function synth(textFile: string, outFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT],
      { env: { ...process.env, TTS_TEXT_FILE: textFile, TTS_OUT_FILE: outFile }, windowsHide: true }
    );
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`powershell exit ${code}: ${err}`))));
  });
}

export async function GET(req: NextRequest) {
  const text = (req.nextUrl.searchParams.get('text') || '').slice(0, 500).trim();
  if (!text) return new NextResponse('Missing text', { status: 400 });

  const key = createHash('sha1').update(text).digest('hex');
  const cachePath = path.join(CACHE_DIR, `${key}.wav`);

  try {
    if (!existsSync(cachePath)) {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      const txtPath = path.join(CACHE_DIR, `${randomBytes(8).toString('hex')}.txt`);
      await fs.writeFile(txtPath, toSsml(text), 'utf8');
      try {
        await synth(txtPath, cachePath);
      } finally {
        await fs.unlink(txtPath).catch(() => {});
      }
    }
    const buf = await fs.readFile(cachePath);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(buf.length),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    console.error('TTS error:', e);
    return new NextResponse('TTS failed', { status: 500 });
  }
}
