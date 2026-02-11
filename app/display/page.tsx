'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface ServingTicket {
  ticketNumber: number;
  counterNumber: number;
}

export default function DisplayPage() {
  const [serving, setServing] = useState<ServingTicket[]>([]);
  const [waiting, setWaiting] = useState<number[]>([]);
  const [latestCall, setLatestCall] = useState<ServingTicket | null>(null);
  const [animate, setAnimate] = useState(false);
  const [time, setTime] = useState(new Date());
  const announcementQueue = useRef<ServingTicket[]>([]);
  const speaking = useRef(false);
  const voicesLoaded = useRef(false);
  const bestVoice = useRef<SpeechSynthesisVoice | null>(null);

  // Find best voice
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;
      voicesLoaded.current = true;

      const preferred = [
        'Google UK English Female',
        'Google UK English Male',
        'Microsoft Zira',
        'Microsoft Susan',
        'Samantha',
        'Karen',
        'Daniel',
        'Moira',
        'Tessa',
        'Google US English',
        'Microsoft David',
      ];

      for (const name of preferred) {
        const v = voices.find((voice) => voice.name.includes(name));
        if (v) { bestVoice.current = v; return; }
      }

      // Fallback: pick first English voice that's not espeak
      const english = voices.find(
        (v) => v.lang.startsWith('en') && !v.name.toLowerCase().includes('espeak')
      );
      bestVoice.current = english || voices[0];
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const speakText = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      utterance.pitch = 1.05;
      utterance.volume = 1;
      if (bestVoice.current) utterance.voice = bestVoice.current;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (speaking.current || announcementQueue.current.length === 0) return;
    speaking.current = true;
    const next = announcementQueue.current.shift()!;

    // Dramatic pause before announcement
    await new Promise((r) => setTimeout(r, 500));
    // First announcement — polite and professional
    await speakText(`Attention please. Ticket number ${next.ticketNumber}, you are now being served at counter number ${next.counterNumber}. Please proceed to counter ${next.counterNumber}. Thank you.`);
    // Pause between repeats
    await new Promise((r) => setTimeout(r, 2000));
    // Second announcement — shorter reminder
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
      const servingList = data.serving?.map((t: { number: number; counterNumber: number }) => ({
        ticketNumber: t.number,
        counterNumber: t.counterNumber,
      })) || [];
      const waitingList = data.waiting?.map((t: { number: number }) => t.number) || [];
      setServing(servingList);
      setWaiting(waitingList);
    } catch (e) {
      console.error('Failed to fetch tickets', e);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
    const eventSource = new EventSource('/api/sse');

    eventSource.addEventListener('ticket-called', (e) => {
      const data = JSON.parse(e.data);
      const call = { ticketNumber: data.ticket.number, counterNumber: data.counterNumber };
      setLatestCall(call);
      setAnimate(true);
      setTimeout(() => setAnimate(false), 4000);
      announce(call);
      fetchTickets();
    });

    eventSource.addEventListener('ticket-recalled', (e) => {
      const data = JSON.parse(e.data);
      const call = { ticketNumber: data.ticketNumber, counterNumber: data.counterNumber };
      setLatestCall(call);
      setAnimate(true);
      setTimeout(() => setAnimate(false), 4000);
      announce(call);
    });

    eventSource.addEventListener('ticket-created', () => fetchTickets());
    eventSource.addEventListener('ticket-completed', () => fetchTickets());
    eventSource.addEventListener('queue-reset', () => {
      setServing([]);
      setWaiting([]);
      setLatestCall(null);
    });

    return () => eventSource.close();
  }, [fetchTickets, announce]);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'linear-gradient(160deg, #111a1f 0%, #273237 40%, #1a2328 100%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-10 py-5 border-b border-white/5">
        <div className="flex items-center gap-5">
          <div className="text-5xl font-black text-[#9C213F] tracking-tight">AUIB</div>
          <div className="h-8 w-px bg-white/10" />
          <div className="text-xl text-gray-400 font-light tracking-wide">Queue Management System</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-white tabular-nums">
            {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-sm text-gray-500">
            {time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>

      <div className="flex flex-1 gap-6 p-6 min-h-0">
        {/* Left side - Now Serving */}
        <div className="flex-1 flex flex-col gap-5 min-w-0">
          {/* Main announcement card */}
          <div
            className={`flex-1 glass-card flex flex-col items-center justify-center relative overflow-hidden transition-all duration-700 ${
              animate ? 'animate-glow-pulse border-[#9C213F]/40' : ''
            }`}
          >
            {/* Decorative gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#9C213F]/8 via-transparent to-[#D4A843]/5 pointer-events-none" />

            {latestCall ? (
              <div className={`relative z-10 text-center ${animate ? 'animate-slide-up' : ''}`}>
                <div className="text-2xl font-medium tracking-[0.3em] uppercase text-[#D4A843] mb-4 animate-breathe">
                  Now Serving
                </div>
                <div
                  className={`text-[12rem] font-black leading-none text-white ${animate ? 'animate-number-glow' : ''}`}
                  style={{ textShadow: '0 0 40px rgba(156,33,63,0.5), 0 4px 20px rgba(0,0,0,0.5)' }}
                >
                  {latestCall.ticketNumber}
                </div>
                <div className="mt-6 inline-flex items-center gap-3 px-8 py-3 rounded-full bg-[#9C213F]/20 border border-[#9C213F]/30">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#9C213F] animate-breathe" />
                  <span className="text-2xl font-semibold text-[#9C213F]">Counter {latestCall.counterNumber}</span>
                </div>
              </div>
            ) : (
              <div className="relative z-10 text-center">
                <div className="text-6xl mb-4 opacity-30">🏦</div>
                <div className="text-3xl text-gray-500 font-light">Waiting for tickets...</div>
                <div className="text-gray-600 mt-2">The queue is currently empty</div>
              </div>
            )}
          </div>

          {/* Active counters grid */}
          {serving.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {serving.map((s, i) => (
                <div
                  key={s.counterNumber}
                  className="glass-card-sm p-5 text-center animate-slide-up"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div className="text-xs font-medium tracking-wider uppercase text-gray-500 mb-1">
                    Counter {s.counterNumber}
                  </div>
                  <div className="text-4xl font-bold text-[#9C213F]">{s.ticketNumber}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="w-[360px] flex flex-col gap-5 flex-shrink-0">
          {/* Waiting queue */}
          <div className="flex-1 glass-card p-6 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#D4A843] tracking-wide uppercase">Upcoming</h2>
              <span className="text-sm text-gray-500 bg-white/5 px-3 py-1 rounded-full">{waiting.length} waiting</span>
            </div>
            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {waiting.length === 0 ? (
                <div className="text-gray-600 text-center py-12">
                  <div className="text-4xl mb-2 opacity-40">✨</div>
                  No tickets waiting
                </div>
              ) : (
                waiting.slice(0, 20).map((num, i) => (
                  <div
                    key={num}
                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.06] transition-colors animate-ticket-in"
                    style={{ animationDelay: `${i * 0.04}s` }}
                  >
                    <span className="text-sm text-gray-500 font-mono">#{i + 1}</span>
                    <span className="text-xl font-bold tabular-nums">{num}</span>
                  </div>
                ))
              )}
              {waiting.length > 20 && (
                <div className="text-center text-gray-500 text-sm py-2">+{waiting.length - 20} more</div>
              )}
            </div>
          </div>

          {/* Video / promo area */}
          <div className="h-52 glass-card overflow-hidden flex items-center justify-center relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[#9C213F]/5 to-[#D4A843]/5" />
            <div className="text-center relative z-10">
              <div className="text-5xl mb-3">🎓</div>
              <div className="text-sm text-gray-400 font-medium">AUIB Promotional</div>
              <div className="text-xs text-gray-600 mt-1">Video area</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
