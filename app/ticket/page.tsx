'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

interface TicketData {
  ticket: { number: number; createdAt: string; category: string };
  position: number;
  estimatedWait: number;
}

const DEFAULT_CATEGORIES = ['Registration', 'Finance', 'IT Support', 'General Inquiry'];

export default function TicketPage() {
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [waitingCount, setWaitingCount] = useState(0);
  const [avgServeTime, setAvgServeTime] = useState(5);
  const [showTicket, setShowTicket] = useState(false);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [kioskMode, setKioskMode] = useState(false);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets');
      const data = await res.json();
      setWaitingCount(data.waiting?.length || 0);
      if (data.avgServeTime) setAvgServeTime(data.avgServeTime);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    // Kiosk mode via ?kiosk=1 — only then do we auto-print + auto-reset.
    // Normal browsers visiting /ticket skip auto-print so Chrome's dialog
    // doesn't pop up when you're not using the kiosk launcher.
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('kiosk') === '1') setKioskMode(true);
    }
    fetchQueue();
    // Load categories from settings
    fetch('/api/settings').then(r => r.json()).then(data => {
      if (data.categories) {
        try {
          const cats = JSON.parse(data.categories);
          if (cats.length > 0) setCategories(cats);
        } catch { /* ignore */ }
      }
    }).catch(() => {});

    const eventSource = new EventSource('/api/sse');
    eventSource.addEventListener('ticket-called', () => fetchQueue());
    eventSource.addEventListener('ticket-created', () => fetchQueue());
    eventSource.addEventListener('ticket-completed', () => fetchQueue());
    eventSource.addEventListener('queue-reset', () => {
      setWaitingCount(0);
      setTicketData(null);
      setShowTicket(false);
      setSelectedCategory(null);
    });
    return () => eventSource.close();
  }, [fetchQueue]);

  const takeTicket = async (category: string) => {
    if (loading) return;
    setSelectedCategory(category);
    setLoading(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
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

  const resetView = useCallback(() => { setShowTicket(false); setTicketData(null); setSelectedCategory(null); }, []);

  // Try the local print agent (ESC/POS, instant, no dialog).
  // Uses text/plain content type so there's no CORS preflight.
  const sendToAgent = useCallback(async (data: TicketData) => {
    const created = new Date(data.ticket.createdAt);
    const payload = {
      number: data.ticket.number,
      category: data.ticket.category,
      date: created.toLocaleDateString(),
      time: created.toLocaleTimeString(),
      position: data.position,
      wait: data.estimatedWait,
    };
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('http://localhost:9100/print', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(t);
      if (res.ok) { console.log('[ticket] printed via agent'); return true; }
      console.warn('[ticket] agent returned status', res.status);
    } catch (e) {
      console.warn('[ticket] agent unreachable, falling back to browser print', e);
    }
    return false;
  }, []);

  // Auto-print + auto-reset on every ticket. Agent path is silent & instant.
  // Browser print only runs if the agent is unreachable AND kiosk mode is on.
  useEffect(() => {
    if (!showTicket || !ticketData) return;
    let cancelled = false;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const printedByAgent = await sendToAgent(ticketData);
      if (cancelled) return;
      if (printedByAgent) {
        resetTimer = setTimeout(() => resetView(), 3500);
        return;
      }
      if (kioskMode) {
        requestAnimationFrame(() => { try { window.print(); } catch {} });
        resetTimer = setTimeout(() => resetView(), 4000);
      }
    })();
    return () => { cancelled = true; if (resetTimer) clearTimeout(resetTimer); };
  }, [kioskMode, showTicket, ticketData, resetView, sendToAgent]);

  const estimatedMin = waitingCount * avgServeTime;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#9C213F]/5 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <div className="relative z-10 text-center mb-10 animate-slide-up">
        <Image
          src="/auib-logo.png"
          alt="AUIB"
          width={160}
          height={80}
          priority
          className="mx-auto mb-3"
          style={{ height: 'auto' }}
        />
        <div className="text-xs text-gray-500 tracking-[0.3em] uppercase">Queue Management</div>
        <div className="mt-3 w-16 h-0.5 bg-gradient-to-r from-transparent via-[#D4A843] to-transparent mx-auto" />
      </div>

      {!showTicket ? (
        <div className="relative z-10 w-full max-w-md animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="glass-card p-10 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[#9C213F]/10 border border-[#9C213F]/20 flex items-center justify-center">
              <span className="text-4xl">🎫</span>
            </div>

            <div className="text-gray-500 text-sm uppercase tracking-wider mb-2">People waiting</div>
            <div className="text-6xl font-black text-[#273237] mb-1">{waitingCount}</div>
            <div className="text-sm text-gray-500 mb-6">~{estimatedMin} min estimated</div>

            {/* Category selection — one tap creates the ticket and auto-prints */}
            <div>
              <div className="text-sm text-[#D4A843] font-medium mb-3 uppercase tracking-wider">
                {loading ? (
                  <span className="animate-breathe">Printing ticket for {selectedCategory}...</span>
                ) : (
                  'Select Service'
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => takeTicket(cat)}
                    disabled={loading}
                    className="py-4 px-3 rounded-xl btn-glass text-sm font-medium hover:border-[#9C213F]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative z-10 w-full max-w-md animate-slide-up">
          <div id="print-ticket" className="glass-card p-10 text-center">
            <div className="text-[#9C213F] text-3xl font-black tracking-tight mb-0.5">AUIB</div>
            <div className="text-xs text-gray-500 tracking-wider mb-8">American University in Iraq, Baghdad</div>

            <div className="text-sm font-medium tracking-[0.2em] uppercase text-[#9C213F] mb-3">Your Ticket</div>
            <div
              className="text-9xl font-black text-[#9C213F] mb-4"
              style={{ textShadow: '0 4px 24px rgba(156,33,63,0.18)' }}
            >
              {ticketData?.ticket.number}
            </div>

            {ticketData?.ticket.category && (
              <div className="mb-6 inline-block px-4 py-1.5 rounded-full bg-[#D4A843]/15 border border-[#D4A843]/40 text-[#8a6e2b] text-sm font-semibold">
                {ticketData.ticket.category}
              </div>
            )}

            <div className="w-full h-px bg-gradient-to-r from-transparent via-[#9C213F]/20 to-transparent mb-6" />

            <div className="space-y-3 text-sm">
              {[
                ['Date', new Date(ticketData?.ticket.createdAt || '').toLocaleDateString()],
                ['Time', new Date(ticketData?.ticket.createdAt || '').toLocaleTimeString()],
                ['Position', `#${ticketData?.position}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-semibold text-gray-800">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <button onClick={resetView} className="w-full py-4 rounded-2xl btn-crimson text-lg font-semibold text-white">
              New Ticket
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
