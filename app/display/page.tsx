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
  const announcementQueue = useRef<ServingTicket[]>([]);
  const speaking = useRef(false);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onend = () => {
      speaking.current = false;
      processQueue();
    };
    speaking.current = true;
    window.speechSynthesis.speak(utterance);
  }, []);

  const processQueue = useCallback(() => {
    if (speaking.current || announcementQueue.current.length === 0) return;
    const next = announcementQueue.current.shift()!;
    speak(`Now serving ticket number ${next.ticketNumber} at counter ${next.counterNumber}`);
  }, [speak]);

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
      setTimeout(() => setAnimate(false), 3000);
      announce(call);
      fetchTickets();
    });

    eventSource.addEventListener('ticket-recalled', (e) => {
      const data = JSON.parse(e.data);
      const call = { ticketNumber: data.ticketNumber, counterNumber: data.counterNumber };
      setLatestCall(call);
      setAnimate(true);
      setTimeout(() => setAnimate(false), 3000);
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
    <div className="min-h-screen bg-[#273237] text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4 bg-[#1a2328] border-b border-[#9C213F]/30">
        <div className="flex items-center gap-4">
          <div className="text-4xl font-bold text-[#9C213F]">AUIB</div>
          <div className="text-xl text-gray-300">Queue Management System</div>
        </div>
        <div className="text-lg text-gray-400">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      <div className="flex flex-1 gap-6 p-6">
        {/* Left side - Now Serving */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Main announcement */}
          <div className={`flex-1 rounded-3xl bg-gradient-to-br from-[#1a2328] to-[#273237] border border-white/10 backdrop-blur-xl flex flex-col items-center justify-center relative overflow-hidden ${animate ? 'ring-4 ring-[#9C213F] ring-opacity-50' : ''}`}
            style={{ transition: 'all 0.5s ease' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-[#9C213F]/5 to-transparent" />
            {latestCall ? (
              <div className={`relative z-10 text-center ${animate ? 'animate-pulse' : ''}`}>
                <div className="text-2xl text-gray-400 mb-2">NOW SERVING</div>
                <div className="text-[10rem] font-black leading-none text-white drop-shadow-2xl" 
                  style={{ textShadow: '0 0 40px rgba(156,33,63,0.5)' }}>
                  {latestCall.ticketNumber}
                </div>
                <div className="mt-4 text-3xl text-[#9C213F] font-semibold">
                  Counter {latestCall.counterNumber}
                </div>
              </div>
            ) : (
              <div className="relative z-10 text-center text-gray-500">
                <div className="text-4xl">Waiting for first ticket...</div>
              </div>
            )}
          </div>

          {/* All serving counters */}
          <div className="grid grid-cols-3 gap-4">
            {serving.map((s) => (
              <div key={s.counterNumber} 
                className="rounded-2xl bg-[#1a2328]/80 border border-white/10 backdrop-blur-xl p-6 text-center">
                <div className="text-sm text-gray-400">Counter {s.counterNumber}</div>
                <div className="text-5xl font-bold text-[#9C213F] mt-1">{s.ticketNumber}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right side - Queue + Video */}
        <div className="w-96 flex flex-col gap-6">
          {/* Waiting queue */}
          <div className="flex-1 rounded-3xl bg-[#1a2328]/80 border border-white/10 backdrop-blur-xl p-6 overflow-hidden">
            <h2 className="text-xl font-semibold text-[#9C213F] mb-4">Upcoming</h2>
            <div className="space-y-3 overflow-y-auto max-h-[40vh]">
              {waiting.length === 0 ? (
                <div className="text-gray-500 text-center py-8">No tickets waiting</div>
              ) : (
                waiting.slice(0, 15).map((num, i) => (
                  <div key={num}
                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/5 border border-white/5"
                    style={{ animationDelay: `${i * 0.05}s` }}>
                    <span className="text-gray-400">#{i + 1}</span>
                    <span className="text-2xl font-bold">{num}</span>
                  </div>
                ))
              )}
            </div>
            {waiting.length > 15 && (
              <div className="text-center text-gray-500 mt-3">+{waiting.length - 15} more</div>
            )}
          </div>

          {/* Video placeholder */}
          <div className="h-56 rounded-3xl bg-[#1a2328]/80 border border-white/10 backdrop-blur-xl overflow-hidden flex items-center justify-center">
            <div className="text-center text-gray-500">
              <div className="text-5xl mb-2">🎓</div>
              <div className="text-sm">AUIB Promo Video</div>
              <div className="text-xs text-gray-600 mt-1">Place video here</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
