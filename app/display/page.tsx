'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface ServingTicket {
  ticketNumber: number;
  counterNumber: number;
}

interface VideoItem {
  url: string;
  name: string;
}

export default function DisplayPage() {
  const [serving, setServing] = useState<ServingTicket[]>([]);
  const [waiting, setWaiting] = useState<number[]>([]);
  const [latestCall, setLatestCall] = useState<ServingTicket | null>(null);
  const [animate, setAnimate] = useState(false);
  const [time, setTime] = useState(new Date());
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [voiceReady, setVoiceReady] = useState(false);
  const [needsActivation, setNeedsActivation] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const announcementQueue = useRef<ServingTicket[]>([]);
  const speaking = useRef(false);
  const bestVoice = useRef<SpeechSynthesisVoice | null>(null);
  const voiceSettings = useRef<{ rate: number; pitch: number }>({ rate: 0.85, pitch: 1.05 });

  // Load voice settings & voices
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const loadVoices = async () => {
      const allVoices = window.speechSynthesis.getVoices();
      if (allVoices.length === 0) return;

      // Fetch saved voice settings from API
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

      // Fallback: auto-detect best voice
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

    // Chrome bug: voices may not load until we try to use speechSynthesis
    setTimeout(loadVoices, 500);
    setTimeout(loadVoices, 1500);
  }, []);

  // Load videos from settings
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => {
      if (data.videos) {
        try { setVideos(JSON.parse(data.videos)); } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

  // Auto-play next video when current ends
  const handleVideoEnded = () => {
    if (videos.length > 1) {
      setCurrentVideoIndex((prev) => (prev + 1) % videos.length);
    } else if (videoRef.current) {
      videoRef.current.play();
    }
  };

  useEffect(() => {
    if (videoRef.current && videos.length > 0) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [currentVideoIndex, videos]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Activate audio on user click (required by browsers)
  const activateAudio = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    // Speak empty string to unlock audio context
    const utterance = new SpeechSynthesisUtterance('');
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
    setNeedsActivation(false);
    // Also try to play video
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.muted = true; // keep muted but unlock
      videoRef.current.play().catch(() => {});
    }
  };

  const speakText = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return; }
      // Cancel any stuck speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = voiceSettings.current.rate;
      utterance.pitch = voiceSettings.current.pitch;
      utterance.volume = 1;
      if (bestVoice.current) utterance.voice = bestVoice.current;

      utterance.onend = () => resolve();
      utterance.onerror = (e) => {
        console.error('Speech error:', e);
        resolve();
      };

      // Chrome bug: speechSynthesis can get stuck, resume it
      window.speechSynthesis.cancel();
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
        // Chrome bug: long text gets stuck, keep poking it
        const interval = setInterval(() => {
          if (!window.speechSynthesis.speaking) {
            clearInterval(interval);
          } else {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }
        }, 5000);
        utterance.onend = () => { clearInterval(interval); resolve(); };
        utterance.onerror = () => { clearInterval(interval); resolve(); };
      }, 100);
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (speaking.current || announcementQueue.current.length === 0) return;
    speaking.current = true;
    const next = announcementQueue.current.shift()!;
    await new Promise((r) => setTimeout(r, 500));
    await speakText(`Attention please. Ticket number ${next.ticketNumber}, you are now being served at counter number ${next.counterNumber}. Please proceed to counter ${next.counterNumber}. Thank you.`);
    await new Promise((r) => setTimeout(r, 2000));
    await speakText(`Ticket number ${next.ticketNumber}, counter ${next.counterNumber} please.`);
    speaking.current = false;
    processQueue();
  }, [speakText]);

  const announce = useCallback((ticket: ServingTicket) => {
    announcementQueue.current.push(ticket);
    if (!speaking.current) processQueue();
  }, [processQueue]);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets');
      const data = await res.json();
      setServing(data.serving?.map((t: { number: number; counterNumber: number }) => ({
        ticketNumber: t.number, counterNumber: t.counterNumber,
      })) || []);
      setWaiting(data.waiting?.map((t: { number: number }) => t.number) || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchTickets();
    const eventSource = new EventSource('/api/sse');
    eventSource.addEventListener('ticket-called', (e) => {
      const data = JSON.parse(e.data);
      const call = { ticketNumber: data.ticket.number, counterNumber: data.counterNumber };
      setLatestCall(call);
      setAnimate(true);
      setTimeout(() => setAnimate(false), 5000);
      announce(call);
      fetchTickets();
    });
    eventSource.addEventListener('ticket-recalled', (e) => {
      const data = JSON.parse(e.data);
      const call = { ticketNumber: data.ticketNumber, counterNumber: data.counterNumber };
      setLatestCall(call);
      setAnimate(true);
      setTimeout(() => setAnimate(false), 5000);
      announce(call);
    });
    eventSource.addEventListener('ticket-created', () => fetchTickets());
    eventSource.addEventListener('ticket-completed', () => fetchTickets());
    eventSource.addEventListener('queue-reset', () => { setServing([]); setWaiting([]); setLatestCall(null); });
    return () => eventSource.close();
  }, [fetchTickets, announce]);

  // Build ticker text
  const tickerItems = serving.map(s => `🔴 Ticket ${s.ticketNumber} → Counter ${s.counterNumber}`);
  if (waiting.length > 0) tickerItems.push(`⏳ ${waiting.length} ticket${waiting.length > 1 ? 's' : ''} waiting`);
  const tickerText = tickerItems.length > 0 ? tickerItems.join('     |     ') : 'Welcome to AUIB — Queue Management System';

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-black" onClick={needsActivation ? activateAudio : undefined}>

      {/* Activation overlay */}
      {needsActivation && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-pointer" onClick={activateAudio}>
          <div className="text-center animate-pulse">
            <div className="text-6xl mb-6">🔊</div>
            <div className="text-2xl font-bold text-white mb-2">Click anywhere to activate</div>
            <div className="text-gray-400">Voice announcements require user interaction to start</div>
          </div>
        </div>
      )}

      {/* Voice status indicator */}
      {!needsActivation && (
        <div className="fixed top-2 left-2 z-50 flex items-center gap-1.5 bg-black/50 backdrop-blur rounded-full px-3 py-1">
          <div className={`w-2 h-2 rounded-full ${voiceReady ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
          <span className="text-[10px] text-gray-400">{voiceReady ? 'Voice Ready' : 'Loading voice...'}</span>
        </div>
      )}

      {/* ===== TOP BAR — AUIB Branding ===== */}
      <div className="flex items-center justify-between px-8 py-3 bg-gradient-to-r from-[#9C213F] via-[#b82a4d] to-[#9C213F] shadow-lg shadow-[#9C213F]/20 z-20">
        <div className="flex items-center gap-4">
          <div className="text-3xl font-black text-white tracking-tight">AUIB</div>
          <div className="h-6 w-px bg-white/30" />
          <div className="text-sm text-white/80 font-medium tracking-wide">American University in Iraq, Baghdad</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-white/90 text-sm font-medium">
            {time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          <div className="h-6 w-px bg-white/30" />
          <div className="text-white text-lg font-bold tabular-nums">
            {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </div>

      {/* ===== MAIN CONTENT — Video + Counters ===== */}
      <div className="flex-1 flex min-h-0">
        
        {/* LEFT: Video Area (70%) */}
        <div className="flex-1 relative bg-[#0a0f12]">
          {videos.length > 0 ? (
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              muted
              autoPlay
              playsInline
              onEnded={handleVideoEnded}
            >
              <source src={videos[currentVideoIndex]?.url} />
            </video>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a2328] to-[#0a0f12]">
              <div className="text-center">
                <div className="text-8xl font-black text-[#9C213F]/20 tracking-tight">AUIB</div>
                <div className="text-gray-600 mt-2">Video will appear here</div>
              </div>
            </div>
          )}
          
          {/* Video overlay — subtle AUIB watermark */}
          <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-sm rounded-lg px-3 py-1.5">
            <span className="text-white/60 text-xs font-bold tracking-wider">AUIB</span>
          </div>
        </div>

        {/* RIGHT: Queue Panel (30%) */}
        <div className="w-[380px] flex flex-col bg-[#111a1f] border-l border-[#9C213F]/20">
          
          {/* Now Serving — Main Highlight */}
          <div className={`relative p-6 transition-all duration-700 ${animate ? 'bg-[#9C213F]/10' : ''}`}>
            <div className="absolute inset-0 bg-gradient-to-b from-[#9C213F]/5 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-3 h-3 rounded-full bg-[#9C213F] ${animate ? 'animate-pulse' : ''}`} />
                <span className="text-xs font-bold tracking-[0.25em] uppercase text-[#9C213F]">Now Serving</span>
              </div>
              {latestCall ? (
                <div className={`${animate ? 'animate-slideInRight' : ''}`}>
                  <div className="text-[5rem] font-black text-white leading-none" style={{ textShadow: '0 0 30px rgba(156,33,63,0.4)' }}>
                    {latestCall.ticketNumber}
                  </div>
                  <div className="mt-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#9C213F]/20 border border-[#9C213F]/30">
                    <span className="text-lg font-semibold text-[#9C213F]">Counter {latestCall.counterNumber}</span>
                  </div>
                </div>
              ) : (
                <div className="text-2xl text-gray-600 font-light">—</div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-[#9C213F]/30 to-transparent" />

          {/* Active Counters */}
          {serving.length > 0 && (
            <>
              <div className="px-6 py-4">
                <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#D4A843] mb-3">Active Counters</div>
                <div className="grid grid-cols-2 gap-2">
                  {serving.map((s) => (
                    <div key={s.counterNumber} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">Counter {s.counterNumber}</div>
                      <div className="text-2xl font-bold text-white mt-0.5">{s.ticketNumber}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            </>
          )}

          {/* Waiting Queue */}
          <div className="flex-1 px-6 py-4 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold tracking-[0.2em] uppercase text-gray-500">Waiting</span>
              <span className="text-xs text-gray-600 bg-white/5 px-2.5 py-1 rounded-full">{waiting.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {waiting.length === 0 ? (
                <div className="text-gray-700 text-center py-8 text-sm">Queue is empty</div>
              ) : (
                waiting.slice(0, 25).map((num, i) => (
                  <div key={num} className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <span className="text-xs text-gray-600 font-mono">#{i + 1}</span>
                    <span className="text-lg font-bold text-gray-300 tabular-nums">{num}</span>
                  </div>
                ))
              )}
              {waiting.length > 25 && (
                <div className="text-center text-gray-600 text-xs py-2">+{waiting.length - 25} more</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== BOTTOM TICKER — News-style ===== */}
      <div className="relative z-20">
        {/* Announcement flash bar — appears when new ticket called */}
        {animate && latestCall && (
          <div className="bg-[#D4A843] text-black py-2 px-6 flex items-center gap-4 animate-slideDown">
            <span className="font-black text-sm tracking-wider uppercase bg-[#9C213F] text-white px-3 py-0.5 rounded">
              NOW SERVING
            </span>
            <span className="font-bold text-lg">
              Ticket #{latestCall.ticketNumber} → Counter {latestCall.counterNumber}
            </span>
          </div>
        )}
        
        {/* Scrolling ticker */}
        <div className="bg-[#1a0810] border-t-2 border-[#9C213F] flex items-center overflow-hidden h-12">
          <div className="flex-shrink-0 bg-[#9C213F] h-full flex items-center px-5 z-10">
            <span className="text-white font-black text-sm tracking-wider">AUIB QUEUE</span>
          </div>
          <div className="flex-1 overflow-hidden relative">
            <div className="animate-ticker whitespace-nowrap flex items-center h-12">
              <span className="text-gray-200 text-sm font-medium px-8">
                {tickerText}
                <span className="mx-12 text-[#9C213F]">●</span>
                {tickerText}
                <span className="mx-12 text-[#9C213F]">●</span>
                {tickerText}
              </span>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.33%); }
        }
        .animate-slideInRight { animation: slideInRight 0.6s ease-out; }
        .animate-slideDown { animation: slideDown 0.3s ease-out; }
        .animate-ticker { animation: ticker 30s linear infinite; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(156,33,63,0.3); border-radius: 2px; }
      `}</style>
    </div>
  );
}
