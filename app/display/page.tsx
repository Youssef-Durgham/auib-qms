'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ticketLabel } from '@/app/lib/helpers';

interface ServingTicket {
  ticketNumber: number;
  counterNumber: number;
  category?: string;
  label: string;
}

interface RecentCall {
  label: string;
  counterNumber: number;
  category?: string;
}

interface VideoItem {
  url: string;
  name: string;
}

// The announcement should say only the number, not the prefix letter — e.g.
// label "F1000" is spoken as "1000".
function spokenNumber(label: string) {
  const digits = label.replace(/\D/g, '');
  return digits || label;
}

export default function DisplayPage() {
  const [serving, setServing] = useState<ServingTicket[]>([]);
  const [waiting, setWaiting] = useState<{ number: number; category?: string }[]>([]);
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [latestCall, setLatestCall] = useState<ServingTicket | null>(null);
  const [animate, setAnimate] = useState(false);
  const [time, setTime] = useState(new Date());
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [, setVoiceReady] = useState(false);
  const [needsActivation, setNeedsActivation] = useState(false);
  const [avgServeTime, setAvgServeTime] = useState(5);
  const [customMessages, setCustomMessages] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const startTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcementQueue = useRef<ServingTicket[]>([]);
  const speaking = useRef(false);
  const bestVoice = useRef<SpeechSynthesisVoice | null>(null);
  const voiceSettings = useRef<{ rate: number; pitch: number }>({ rate: 0.85, pitch: 1.05 });
  const audioCtx = useRef<AudioContext | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const lastMsgRef = useRef<number>(Date.now());

  // === CHIME (Feature 1) ===
  const playChime = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      try {
        if (!audioCtx.current) audioCtx.current = new AudioContext();
        const ctx = audioCtx.current;
        const now = ctx.currentTime;

        // First tone
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        gain1.gain.setValueAtTime(0.3, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.5);

        // Second tone (higher, slight delay)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1318.5, now + 0.15);
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.setValueAtTime(0.3, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.8);

        setTimeout(resolve, 900);
      } catch {
        resolve();
      }
    });
  }, []);

  // Load voice settings & voices
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const loadVoices = async () => {
      const allVoices = window.speechSynthesis.getVoices();
      if (allVoices.length === 0) return;
      try {
        const res = await fetch('/api/settings');
        const settings = await res.json();
        if (settings.voiceRate) voiceSettings.current.rate = parseFloat(settings.voiceRate);
        if (settings.voicePitch) voiceSettings.current.pitch = parseFloat(settings.voicePitch);
        if (settings.voiceName) {
          const saved = allVoices.find((v) => v.name === settings.voiceName);
          if (saved) { bestVoice.current = saved; setVoiceReady(true); return; }
        }
      } catch (e) { console.error(e); }
      const preferred = ['Google UK English Female','Microsoft Zira','Samantha','Google US English','Microsoft David'];
      for (const name of preferred) {
        const v = allVoices.find((voice) => voice.name.includes(name));
        if (v) { bestVoice.current = v; setVoiceReady(true); return; }
      }
      const eng = allVoices.find((v) => v.lang.startsWith('en') && !v.name.toLowerCase().includes('espeak'));
      bestVoice.current = eng || allVoices[0];
      setVoiceReady(true);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    setTimeout(loadVoices, 500);
    setTimeout(loadVoices, 1500);
  }, []);

  // Load videos and custom messages from settings. Oversized clips are dropped
  // from the playlist entirely: on the weak TV-box decoder, large/high-bitrate
  // files stutter and stall (looks like slow loading even though the server is
  // local), so we only play files at/under MAX_VIDEO_MB. Tune the limit below.
  useEffect(() => {
    const MAX_VIDEO_MB = 100;
    const MAX_BYTES = MAX_VIDEO_MB * 1024 * 1024;
    fetch('/api/settings').then(r => r.json()).then(async (data) => {
      if (data.tickerMessages) {
        try { setCustomMessages(JSON.parse(data.tickerMessages)); } catch { /* ignore */ }
      }
      let list: VideoItem[] = [];
      if (data.videos) {
        try { list = JSON.parse(data.videos); } catch { /* ignore */ }
      }
      // Probe each file's size and keep only the ones small enough to play
      // smoothly. A failed probe keeps the clip (don't over-filter on a glitch).
      const sized = await Promise.all(list.map(async (v) => {
        try {
          const h = await fetch(v.url, { method: 'HEAD' });
          const len = parseInt(h.headers.get('content-length') || '0', 10);
          if (len > 0 && len > MAX_BYTES) {
            console.warn(`Skipping oversized video (${Math.round(len / 1048576)}MB > ${MAX_VIDEO_MB}MB):`, v.url);
            return null;
          }
          return v;
        } catch {
          return v;
        }
      }));
      setVideos(sized.filter((v): v is VideoItem => v !== null));
    }).catch(() => {});
  }, []);

  // Advance to the next clip in the playlist (wraps around).
  const advance = useCallback(() => {
    setCurrentVideoIndex((prev) => (videos.length > 1 ? (prev + 1) % videos.length : prev));
  }, [videos.length]);

  // Skip a clip that is broken/corrupt or that never starts. A short delay
  // before advancing prevents a tight error→advance→error spin if several clips
  // in a row are bad.
  const skipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipBadVideo = useCallback(() => {
    if (skipTimer.current) return; // a skip is already scheduled
    skipTimer.current = setTimeout(() => {
      skipTimer.current = null;
      if (videos.length > 1) advance();
      else { videoRef.current?.load(); videoRef.current?.play().catch(() => {}); }
    }, 600);
  }, [advance, videos.length]);

  const handleVideoEnded = () => {
    // With a single video we use the native `loop` attribute, so onEnded only
    // fires for a multi-video playlist — advance to the next clip.
    if (videos.length > 1) advance();
    else if (videoRef.current) videoRef.current.play().catch(() => {});
  };

  // Recover a stuck/errored video. On a decode/source error (corrupt clip) we
  // skip to the next; otherwise just nudge playback.
  const recoverVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v || videos.length === 0) return;
    if (v.error) { skipBadVideo(); return; }
    if (v.paused || v.ended) v.play().catch(() => {});
  }, [videos.length, skipBadVideo]);

  // When the source changes: (re)load and play, and arm a start-timeout. A
  // healthy clip fires `playing` (which clears the timeout via onPlaying); a
  // corrupt one that never starts gets skipped automatically so the board never
  // sits on a blank frame.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || videos.length === 0) return;
    v.load();
    v.play().catch(() => {});
    if (startTimeout.current) clearTimeout(startTimeout.current);
    startTimeout.current = setTimeout(() => {
      // Never reached a playable state in time → treat as broken, move on.
      if (videos.length > 1) advance();
      else { v.load(); v.play().catch(() => {}); }
    }, 9000);
    return () => { if (startTimeout.current) clearTimeout(startTimeout.current); };
  }, [currentVideoIndex, videos, advance]);

  // Clear the start-timeout as soon as the clip actually starts playing.
  const handlePlaying = useCallback(() => {
    if (startTimeout.current) { clearTimeout(startTimeout.current); startTimeout.current = null; }
  }, []);

  // Watchdog: a TV display runs for hours, and a single rejected play() promise,
  // a transient decode error, or a stall can leave the video frozen with no way
  // to recover. Poll every few seconds and kick it back into playback.
  useEffect(() => {
    if (videos.length === 0) return;
    const id = setInterval(recoverVideo, 4000);
    return () => clearInterval(id);
  }, [videos, recoverVideo]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto daily reset check
  useEffect(() => {
    fetch('/api/cron/reset', { method: 'POST' }).catch(() => {});
    const interval = setInterval(() => {
      fetch('/api/cron/reset', { method: 'POST' }).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const activateAudio = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      const utterance = new SpeechSynthesisUtterance('');
      utterance.volume = 0;
      window.speechSynthesis.speak(utterance);
    } catch {}
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      if (audioCtx.current.state === 'suspended') audioCtx.current.resume().catch(() => {});
    } catch {}
    setNeedsActivation(false);
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // Auto-activate on mount; if browser blocks it (no autoplay flag), activate
  // on the first user interaction anywhere on the page.
  useEffect(() => {
    activateAudio();
    const handler = () => activateAudio();
    window.addEventListener('click', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, [activateAudio]);

  const speakText = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = voiceSettings.current.rate;
      utterance.pitch = voiceSettings.current.pitch;
      utterance.volume = 1;
      if (bestVoice.current) utterance.voice = bestVoice.current;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.cancel();
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
        const interval = setInterval(() => {
          if (!window.speechSynthesis.speaking) { clearInterval(interval); }
          else { window.speechSynthesis.pause(); window.speechSynthesis.resume(); }
        }, 5000);
        utterance.onend = () => { clearInterval(interval); resolve(); };
        utterance.onerror = () => { clearInterval(interval); resolve(); };
      }, 100);
    });
  }, []);

  // Speak via the server's TTS engine, played through the Web Audio context that
  // the chime already uses. This is what makes voice work inside the FreeKiosk
  // WebView, which lacks the browser speechSynthesis API. Returns false on any
  // failure so the caller can fall back to browser speech (on real Chrome).
  const speakViaServer = useCallback((text: string): Promise<boolean> => {
    return new Promise((resolve) => {
      (async () => {
        try {
          if (!audioCtx.current) audioCtx.current = new AudioContext();
          const ctx = audioCtx.current;
          if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
          const res = await fetch('/api/tts?text=' + encodeURIComponent(text));
          if (!res.ok) { resolve(false); return; }
          const data = await res.arrayBuffer();
          // decodeAudioData: support both the promise and legacy callback forms.
          const audioBuf: AudioBuffer = await new Promise((res2, rej2) => {
            const maybe = ctx.decodeAudioData(data, res2, rej2) as unknown as Promise<AudioBuffer> | undefined;
            if (maybe && typeof maybe.then === 'function') maybe.then(res2, rej2);
          });
          const src = ctx.createBufferSource();
          src.buffer = audioBuf;
          src.connect(ctx.destination);
          src.onended = () => resolve(true);
          src.start();
        } catch {
          resolve(false);
        }
      })();
    });
  }, []);

  // Speak a phrase: prefer server TTS (works everywhere incl. WebView), and only
  // fall back to the browser engine if the server call fails.
  const speak = useCallback(async (text: string): Promise<void> => {
    const ok = await speakViaServer(text);
    if (!ok) await speakText(text);
  }, [speakViaServer, speakText]);

  const processQueue = useCallback(async () => {
    if (speaking.current || announcementQueue.current.length === 0) return;
    speaking.current = true;
    const next = announcementQueue.current.shift()!;
    const spoken = spokenNumber(next.label);
    // Play chime before speaking
    await playChime();
    await new Promise((r) => setTimeout(r, 300));
    await speak(`Ticket number ${spoken}, please proceed to desk number ${next.counterNumber}.`);
    speaking.current = false;
    processQueue();
  }, [speak, playChime]);

  const announce = useCallback((ticket: ServingTicket) => {
    announcementQueue.current.push(ticket);
    if (!speaking.current) processQueue();
  }, [processQueue]);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets');
      const data = await res.json();
      setServing(data.serving?.map((t: { number: number; counterNumber: number; category?: string; prefix?: string; typeSeq?: number }) => ({
        ticketNumber: t.number, counterNumber: t.counterNumber, category: t.category, label: ticketLabel(t),
      })) || []);
      setWaiting(data.waiting?.map((t: { number: number; category?: string }) => ({ number: t.number, category: t.category })) || []);
      const calls: RecentCall[] = data.recentCalls || [];
      setRecentCalls(calls);
      // Keep the big "Now Serving" panel in sync from the server state too — not
      // just from live events. This way the board self-corrects on every poll
      // even if a live announcement was missed (e.g. the SSE link briefly died),
      // and it always reflects TODAY's data (the API is date-scoped).
      const servingArr: { number: number; counterNumber: number; category?: string; prefix?: string; typeSeq?: number; servedAt?: string }[] = data.serving || [];
      if (servingArr.length > 0) {
        const latest = servingArr.reduce((a, b) => (new Date(a.servedAt || 0) >= new Date(b.servedAt || 0) ? a : b));
        const call: ServingTicket = { ticketNumber: latest.number, counterNumber: latest.counterNumber, category: latest.category, label: ticketLabel(latest) };
        setLatestCall((prev) => (prev && prev.label === call.label && prev.counterNumber === call.counterNumber) ? prev : call);
      } else if (calls.length > 0) {
        // Nobody being served right now — seed once so the board isn't blank.
        const seed: ServingTicket = { ticketNumber: 0, counterNumber: calls[0].counterNumber, category: calls[0].category, label: calls[0].label };
        setLatestCall((prev) => prev ?? seed);
      }
      if (data.avgServeTime) setAvgServeTime(data.avgServeTime);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchTickets();
    const markAlive = () => { lastMsgRef.current = Date.now(); };

    const connect = () => {
      try { esRef.current?.close(); } catch { /* ignore */ }
      const es = new EventSource('/api/sse');
      esRef.current = es;
      markAlive();

      // Whenever the link (re)opens, immediately re-sync from the server so the
      // board can never sit on a stale snapshot after a dropped connection.
      es.onopen = () => { markAlive(); fetchTickets(); };
      es.addEventListener('connected', () => { markAlive(); fetchTickets(); });
      es.addEventListener('heartbeat', markAlive);

      es.addEventListener('ticket-called', (e) => {
        markAlive();
        const data = JSON.parse(e.data);
        const call = { ticketNumber: data.ticket.number, counterNumber: data.counterNumber, category: data.ticket.category, label: ticketLabel(data.ticket) };
        setLatestCall(call);
        setAnimate(true);
        setTimeout(() => setAnimate(false), 5000);
        announce(call);
        fetchTickets();
      });
      es.addEventListener('ticket-recalled', (e) => {
        markAlive();
        const data = JSON.parse(e.data);
        const call = { ticketNumber: data.ticketNumber, counterNumber: data.counterNumber, label: ticketLabel({ prefix: data.prefix, typeSeq: data.typeSeq, number: data.ticketNumber }) };
        setLatestCall(call);
        setAnimate(true);
        setTimeout(() => setAnimate(false), 5000);
        announce(call);
      });
      es.addEventListener('ticket-created', () => { markAlive(); fetchTickets(); });
      es.addEventListener('ticket-completed', () => { markAlive(); fetchTickets(); });
      es.addEventListener('ticket-transferred', () => { markAlive(); fetchTickets(); });
      es.addEventListener('ticket-skipped', () => { markAlive(); fetchTickets(); });
      es.addEventListener('ticket-auto-cancelled', () => { markAlive(); fetchTickets(); });
      es.addEventListener('queue-reset', () => { markAlive(); setServing([]); setWaiting([]); setRecentCalls([]); setLatestCall(null); });
    };

    connect();

    // Polling fallback: keep the board current even if the live link is dead.
    // The API is date-scoped, so this also makes yesterday's tickets disappear
    // on a new day without anyone touching the device.
    const polling = setInterval(fetchTickets, 10000);

    // Watchdog: the heartbeat arrives every 15s. If nothing (not even a
    // heartbeat) has come for 45s the link is dead — rebuild it so calls and
    // voice announcements resume automatically, with no manual restart.
    const watchdog = setInterval(() => {
      if (Date.now() - lastMsgRef.current > 45000) connect();
    }, 10000);

    return () => {
      clearInterval(polling);
      clearInterval(watchdog);
      try { esRef.current?.close(); } catch { /* ignore */ }
    };
  }, [fetchTickets, announce]);

  // Build ticker text (English only + custom messages)
  const tickerItems: string[] = [];
  serving.forEach(s => {
    tickerItems.push(`🔴 Ticket ${s.label} → Counter ${s.counterNumber}`);
  });
  if (waiting.length > 0) {
    tickerItems.push(`⏳ ${waiting.length} ticket${waiting.length > 1 ? 's' : ''} waiting`);
  }
  if (avgServeTime > 0 && waiting.length > 0) {
    tickerItems.push(`⏱ Est. wait: ~${waiting.length * avgServeTime} min`);
  }
  customMessages.forEach(msg => tickerItems.push(`📢 ${msg}`));
  const tickerText = tickerItems.length > 0 ? tickerItems.join('     |     ') : 'Welcome to the American University in Iraq, Baghdad (AUIB)';

  return (
    // NOTE: colors/gradients here use inline styles + explicit rgba() instead of
    // Tailwind opacity modifiers (/NN) and gradient utilities. Tailwind v4 emits
    // color-mix() and "in oklab" gradients for those, which old Android WebViews
    // (used by TV-box kiosk apps) can't parse — leaving the page unstyled.
    <div className="h-screen flex flex-col overflow-hidden select-none" style={{ background: 'linear-gradient(135deg, #fbfaf7, #ffffff)' }}>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT: Video on top, Now-Serving box below it */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Video Area */}
          <div className="flex-1 relative bg-gray-100 min-h-0">
            {videos.length > 0 ? (
              <video
                ref={videoRef}
                // Single stable element whose `src` is swapped on advance (see the
                // effect below). Using a React `key` here remounts the element on
                // every clip change, which races with autoplay and can leave the
                // board on a blank frame after the first video — so we DON'T key it.
                src={videos[currentVideoIndex]?.url}
                className="absolute top-0 right-0 bottom-0 left-0 w-full h-full object-cover"
                // Promote the video to its own GPU compositing layer so repaints
                // elsewhere on the board (the call number, ticker) can't make it
                // stutter during an announcement.
                style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                muted
                autoPlay
                playsInline
                preload="auto"
                loop={videos.length <= 1}
                onEnded={handleVideoEnded}
                onPlaying={handlePlaying}
                onError={skipBadVideo}
                onStalled={recoverVideo}
              />
            ) : (
              <div className="absolute top-0 right-0 bottom-0 left-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ffffff, #fbfaf7)' }}>
                <div className="text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/auib-logo.png" alt="AUIB" className="mx-auto h-40 w-auto opacity-80 animate-breathe" />
                  <div className="text-gray-400 mt-6 text-base tracking-[0.3em] uppercase">Welcome to AUIB</div>
                </div>
              </div>
            )}
            <div className="absolute top-5 right-5 border border-gray-200 shadow-sm rounded-lg px-4 py-2" style={{ background: 'rgba(255,255,255,0.85)' }}>
              <span className="text-[#9C213F] text-base font-black tracking-wider">AUIB</span>
            </div>
          </div>

          {/* Now-Serving box BELOW the video (TICKET NUMBER | COUNTER NUMBER) */}
          <div
            className="flex items-stretch bg-white transition-all duration-700"
            style={{ borderTop: '6px solid #9C213F', boxShadow: '0 -12px 35px -18px rgba(156,33,63,0.45)', ...(animate ? { background: 'rgba(156,33,63,0.05)' } : {}) }}
          >
            <div className="flex-1 text-center py-8 px-6">
              <div className="text-3xl font-bold tracking-[0.25em] uppercase text-gray-500 mb-2">Ticket Number</div>
              {latestCall ? (
                <div
                  key={`t-${latestCall.label}-${latestCall.counterNumber}`}
                  className={`font-black text-[#9C213F] leading-none tabular-nums ${animate ? 'animate-number-glow' : ''}`}
                  style={{ fontSize: '9.5rem', textShadow: '0 6px 30px rgba(156,33,63,0.22)' }}
                >
                  {latestCall.label}
                </div>
              ) : (
                <div className="font-black text-gray-200 leading-none" style={{ fontSize: '9.5rem' }}>—</div>
              )}
            </div>
            <div className="w-0.5 my-8" style={{ background: 'rgba(156,33,63,0.18)' }} />
            <div className="flex-1 text-center py-8 px-6">
              <div className="text-3xl font-bold tracking-[0.25em] uppercase text-gray-500 mb-2">Counter Number</div>
              {latestCall ? (
                <div
                  key={`c-${latestCall.label}-${latestCall.counterNumber}`}
                  className={`font-black text-gray-800 leading-none tabular-nums ${animate ? 'animate-number-glow' : ''}`}
                  style={{ fontSize: '9.5rem' }}
                >
                  {latestCall.counterNumber}
                </div>
              ) : (
                <div className="font-black text-gray-200 leading-none" style={{ fontSize: '9.5rem' }}>—</div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Recent-calls table (TICKET NUMBER | COUNTER NUMBER) */}
        <div className="w-[32rem] flex flex-col min-h-0 bg-white" style={{ borderLeft: '2px solid rgba(156,33,63,0.15)', boxShadow: '-12px 0 40px -20px rgba(156,33,63,0.25)' }}>
          {/* Header */}
          <div className="flex items-stretch" style={{ background: 'linear-gradient(90deg, #9C213F, #b82a4d)' }}>
            <div className="flex-1 text-center py-6 px-4">
              <div className="text-white font-bold text-4xl tracking-[0.12em] uppercase leading-tight">Ticket<br/>Number</div>
            </div>
            <div className="w-px" style={{ background: 'rgba(255,255,255,0.25)' }} />
            <div className="flex-1 text-center py-6 px-4">
              <div className="text-white font-bold text-4xl tracking-[0.12em] uppercase leading-tight">Counter<br/>Number</div>
            </div>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
            {recentCalls.length === 0 ? (
              <div className="text-gray-300 text-center py-20 text-2xl font-light">—</div>
            ) : (
              recentCalls.map((c, i) => (
                <div
                  key={`${c.label}-${c.counterNumber}-${i}`}
                  className="flex items-stretch border-b"
                  style={{
                    borderColor: 'rgba(156,33,63,0.08)',
                    background: i === 0 ? 'rgba(156,33,63,0.07)' : (i % 2 === 0 ? '#ffffff' : '#faf7f8'),
                  }}
                >
                  <div className="flex-1 text-center py-4 px-4">
                    <span className="font-bold text-gray-800 tabular-nums" style={{ fontSize: '2.6rem' }}>{c.label}</span>
                  </div>
                  <div className="w-px" style={{ background: 'rgba(156,33,63,0.08)' }} />
                  <div className="flex-1 text-center py-4 px-4">
                    <span className="font-bold text-[#9C213F] tabular-nums" style={{ fontSize: '2.6rem' }}>{c.counterNumber}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer clock — like the board's bottom-right */}
          <div className="flex items-center justify-between px-6 py-3" style={{ background: 'linear-gradient(90deg, #9C213F, #b82a4d)' }}>
            <span className="text-white font-bold text-2xl tabular-nums leading-none">
              {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Riyadh' })}
            </span>
            <span className="text-sm font-medium tabular-nums" style={{ color: 'rgba(255,255,255,0.8)' }}>
              {time.toLocaleDateString('en-GB', { timeZone: 'Asia/Riyadh' })}
            </span>
          </div>
        </div>
      </div>

      {/* BOTTOM TICKER */}
      <div className="relative z-20">
        {animate && latestCall && (
          <div className="text-[#273237] py-3 px-8 flex items-center gap-5 animate-slideDown" style={{ background: 'linear-gradient(90deg, #B8BCC0, #d4d7da)' }}>
            <span className="font-black text-base tracking-wider uppercase bg-[#9C213F] text-white px-4 py-1 rounded-lg shadow">
              NOW SERVING | الآن
            </span>
            <span className="font-bold text-2xl">
              Ticket {latestCall.label} → Counter {latestCall.counterNumber}
              {latestCall.category && <span className="text-lg ml-2 font-medium">({latestCall.category})</span>}
            </span>
          </div>
        )}
        <div className="flex items-center overflow-hidden h-28" style={{ background: 'linear-gradient(90deg, #9C213F, #b82a4d, #9C213F)', borderTop: '5px solid #C9CCCE' }}>
          <div className="flex-shrink-0 bg-white h-full flex items-center justify-center px-10 z-10 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/auib-logo-wide.png" alt="AUIB" className="h-16 w-auto" />
          </div>
          <div className="flex-1 overflow-hidden relative">
            <div className="animate-ticker whitespace-nowrap flex items-center h-28">
              <span className="text-white text-4xl font-semibold px-10">
                {tickerText}
                <span className="mx-14 text-[#C9CCCE]">●</span>
                {tickerText}
                <span className="mx-14 text-[#C9CCCE]">●</span>
                {tickerText}
              </span>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.33%); }
        }
        .animate-slideDown { animation: slideDown 0.3s ease-out; }
        /* will-change + translateZ keep the marquee on its own GPU layer so it
           doesn't drop frames while a new (large) video is buffering/decoding. */
        .animate-ticker { animation: ticker 30s linear infinite; will-change: transform; transform: translateZ(0); backface-visibility: hidden; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(156,33,63,0.3); border-radius: 3px; }
      `}</style>

      {/* Scale the whole display to the TV's viewport. Every Tailwind size is in
          rem, so making the root font-size proportional to viewport width (vw)
          makes the entire UI shrink/grow with the screen — and vw works on old
          WebViews, unlike clamp(). Bump this number up for bigger, down for smaller. */}
      <style jsx global>{`
        html { font-size: 0.85vw; }
      `}</style>
    </div>
  );
}
