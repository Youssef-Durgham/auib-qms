'use client';

import { useState, useEffect, useCallback } from 'react';

interface TicketData {
  ticket: { number: number; createdAt: string };
  position: number;
  estimatedWait: number;
}

export default function TicketPage() {
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [waitingCount, setWaitingCount] = useState(0);
  const [showTicket, setShowTicket] = useState(false);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets');
      const data = await res.json();
      setWaitingCount(data.waiting?.length || 0);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const eventSource = new EventSource('/api/sse');
    eventSource.addEventListener('ticket-called', () => fetchQueue());
    eventSource.addEventListener('ticket-created', () => fetchQueue());
    eventSource.addEventListener('ticket-completed', () => fetchQueue());
    eventSource.addEventListener('queue-reset', () => {
      setWaitingCount(0);
      setTicketData(null);
      setShowTicket(false);
    });
    return () => eventSource.close();
  }, [fetchQueue]);

  const takeTicket = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setTicketData(data);
      setShowTicket(true);
    } catch (e) {
      console.error(e);
      alert('Failed to take ticket. Please try again.');
    }
    setLoading(false);
  };

  const printTicket = () => window.print();
  const resetView = () => { setShowTicket(false); setTicketData(null); };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#9C213F]/5 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <div className="relative z-10 text-center mb-10 animate-slide-up">
        <div className="text-5xl font-black text-[#9C213F] tracking-tight">AUIB</div>
        <div className="text-sm text-gray-500 tracking-widest uppercase mt-1">Queue Management</div>
        <div className="mt-3 w-16 h-0.5 bg-gradient-to-r from-transparent via-[#D4A843] to-transparent mx-auto" />
      </div>

      {!showTicket ? (
        <div className="relative z-10 w-full max-w-md animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="glass-card p-10 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[#9C213F]/10 border border-[#9C213F]/20 flex items-center justify-center">
              <span className="text-4xl">🎫</span>
            </div>

            <div className="text-gray-400 text-sm uppercase tracking-wider mb-2">People waiting</div>
            <div className="text-6xl font-black text-white mb-1">{waitingCount}</div>
            <div className="text-sm text-gray-600 mb-8">~{waitingCount * 5} min estimated</div>

            <button
              onClick={takeTicket}
              disabled={loading}
              className="w-full py-7 rounded-2xl btn-crimson text-2xl font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="animate-breathe">Taking ticket...</span>
              ) : (
                'Take a Ticket'
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="relative z-10 w-full max-w-md animate-slide-up">
          <div id="print-ticket" className="glass-card p-10 text-center">
            <div className="text-[#9C213F] text-3xl font-black tracking-tight mb-0.5">AUIB</div>
            <div className="text-xs text-gray-500 tracking-wider mb-8">American University in Iraq, Baghdad</div>

            <div className="text-sm font-medium tracking-[0.2em] uppercase text-[#D4A843] mb-3">Your Ticket</div>
            <div
              className="text-9xl font-black text-white mb-6 animate-number-glow"
              style={{ textShadow: '0 0 40px rgba(156,33,63,0.4)' }}
            >
              {ticketData?.ticket.number}
            </div>

            <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-6" />

            <div className="space-y-3 text-sm">
              {[
                ['Date', new Date(ticketData?.ticket.createdAt || '').toLocaleDateString()],
                ['Time', new Date(ticketData?.ticket.createdAt || '').toLocaleTimeString()],
                ['Position', `#${ticketData?.position}`],
                ['Est. Wait', `~${ticketData?.estimatedWait} min`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={printTicket} className="flex-1 py-4 rounded-2xl btn-glass text-lg font-semibold">
              🖨️ Print
            </button>
            <button onClick={resetView} className="flex-1 py-4 rounded-2xl btn-crimson text-lg font-semibold text-white">
              New Ticket
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
