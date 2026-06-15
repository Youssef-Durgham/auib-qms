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
  const announcementQueue = useRef<ServingTicket[]>([]);
  const speaking = useRef(false);
  const bestVoice = useRef<SpeechSynthesisVoice | null>(null);
  const voiceSettings = useRef<{ rate: number; pitch: number }>({ rate: 0.85, pitch: 1.05 });
  const audioCtx = useRef<AudioContext | null>(null);

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

  // Load videos and custom messages from settings
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => {
      if (data.videos) {
        try { setVideos(JSON.parse(data.videos)); } catch { /* ignore */ }
      }
      if (data.tickerMessages) {
        try { setCustomMessages(JSON.parse(data.tickerMessages)); } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

  const handleVideoEnded = () => {
    // With a single video we use the native `loop` attribute, so onEnded only
    // fires for a multi-video playlist — advance to the next clip.
    if (videos.length > 1) {
      setCurrentVideoIndex((prev) => (prev + 1) % videos.length);
    } else if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  // Recover a stuck/errored video. On a decode or source error we skip to the
  // next clip (or reload the only clip); otherwise we just nudge playback.
  const recoverVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v || videos.length === 0) return;
    if (v.error) {
      if (videos.length > 1) {
        setCurrentVideoIndex((prev) => (prev + 1) % videos.length);
      } else {
        v.load();
        v.play().catch(() => {});
      }
      return;
    }
    if (v.paused || v.ended) v.play().catch(() => {});
  }, [videos]);

  useEffect(() => {
    if (videoRef.current && videos.length > 0) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [currentVideoIndex, videos]);

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
      // On a fresh load, seed the hero so the board isn't blank until the next
      // live announcement: prefer a ticket currently being served, otherwise the
      // most recent completed call.
      const servingArr: { number: number; counterNumber: number; category?: string; prefix?: string; typeSeq?: number; servedAt?: string }[] = data.serving || [];
      let seed: ServingTicket | null = null;
      if (servingArr.length > 0) {
        const latest = servingArr.reduce((a, b) => (new Date(a.servedAt || 0) >= new Date(b.servedAt || 0) ? a : b));
        seed = { ticketNumber: latest.number, counterNumber: latest.counterNumber, category: latest.category, label: ticketLabel(latest) };
      } else if (calls.length > 0) {
        seed = { ticketNumber: 0, counterNumber: calls[0].counterNumber, category: calls[0].category, label: calls[0].label };
      }
      if (seed) setLatestCall((prev) => prev ?? seed);
      if (data.avgServeTime) setAvgServeTime(data.avgServeTime);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchTickets();
    const eventSource = new EventSource('/api/sse');
    eventSource.addEventListener('ticket-called', (e) => {
      const data = JSON.parse(e.data);
      const call = { ticketNumber: data.ticket.number, counterNumber: data.counterNumber, category: data.ticket.category, label: ticketLabel(data.ticket) };
      setLatestCall(call);
      setAnimate(true);
      setTimeout(() => setAnimate(false), 5000);
      announce(call);
      fetchTickets();
    });
    eventSource.addEventListener('ticket-recalled', (e) => {
      const data = JSON.parse(e.data);
      const call = { ticketNumber: data.ticketNumber, counterNumber: data.counterNumber, label: ticketLabel({ prefix: data.prefix, typeSeq: data.typeSeq, number: data.ticketNumber }) };
      setLatestCall(call);
      setAnimate(true);
      setTimeout(() => setAnimate(false), 5000);
      announce(call);
    });
    eventSource.addEventListener('ticket-created', () => fetchTickets());
    eventSource.addEventListener('ticket-completed', () => fetchTickets());
    eventSource.addEventListener('ticket-transferred', () => fetchTickets());
    eventSource.addEventListener('ticket-skipped', () => fetchTickets());
    eventSource.addEventListener('ticket-auto-cancelled', () => fetchTickets());
    eventSource.addEventListener('queue-reset', () => { setServing([]); setWaiting([]); setRecentCalls([]); setLatestCall(null); });
    return () => eventSource.close();
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
                key={videos[currentVideoIndex]?.url}
                className="absolute top-0 right-0 bottom-0 left-0 w-full h-full object-cover"
                muted
                autoPlay
                playsInline
                loop={videos.length <= 1}
                onEnded={handleVideoEnded}
                onError={recoverVideo}
                onStalled={recoverVideo}
              >
                <source src={videos[currentVideoIndex]?.url} />
              </video>
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
        .animate-ticker { animation: ticker 30s linear infinite; }
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
