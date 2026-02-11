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

  const printTicket = () => {
    window.print();
  };

  const resetView = () => {
    setShowTicket(false);
    setTicketData(null);
  };

  return (
    <>
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #print-ticket, #print-ticket * { visibility: visible; }
          #print-ticket { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      <div className="min-h-screen bg-[#273237] text-white flex flex-col items-center justify-center p-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl font-bold text-[#9C213F] mb-2">AUIB</div>
          <div className="text-xl text-gray-400">Queue Management System</div>
        </div>

        {!showTicket ? (
          /* Take ticket view */
          <div className="w-full max-w-md">
            <div className="rounded-3xl bg-[#1a2328]/80 border border-white/10 backdrop-blur-xl p-8 text-center">
              <div className="text-6xl mb-4">🎫</div>
              <div className="text-gray-400 mb-2">Currently waiting</div>
              <div className="text-5xl font-bold text-[#9C213F] mb-6">{waitingCount}</div>
              
              <button
                onClick={takeTicket}
                disabled={loading}
                className="w-full py-8 rounded-2xl bg-[#9C213F] hover:bg-[#b82a4d] active:scale-95 transition-all text-3xl font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#9C213F]/30"
              >
                {loading ? 'Taking...' : 'Take a Ticket'}
              </button>

              <div className="text-sm text-gray-500 mt-4">
                Estimated wait: ~{waitingCount * 5} minutes
              </div>
            </div>
          </div>
        ) : (
          /* Ticket display */
          <div className="w-full max-w-md">
            <div id="print-ticket" className="rounded-3xl bg-[#1a2328]/80 border border-white/10 backdrop-blur-xl p-8 text-center">
              <div className="text-[#9C213F] text-3xl font-bold mb-1">AUIB</div>
              <div className="text-sm text-gray-400 mb-6">American University in Iraq, Baghdad</div>
              
              <div className="text-gray-400 text-lg mb-2">Your Ticket Number</div>
              <div className="text-9xl font-black text-white mb-4" style={{ textShadow: '0 0 30px rgba(156,33,63,0.4)' }}>
                {ticketData?.ticket.number}
              </div>

              <div className="border-t border-white/10 pt-4 mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Date</span>
                  <span>{new Date(ticketData?.ticket.createdAt || '').toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Time</span>
                  <span>{new Date(ticketData?.ticket.createdAt || '').toLocaleTimeString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Position</span>
                  <span>#{ticketData?.position}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Est. Wait</span>
                  <span>~{ticketData?.estimatedWait} min</span>
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={printTicket}
                className="flex-1 py-4 rounded-2xl bg-white/10 hover:bg-white/20 transition-all text-lg font-semibold"
              >
                🖨️ Print
              </button>
              <button
                onClick={resetView}
                className="flex-1 py-4 rounded-2xl bg-[#9C213F] hover:bg-[#b82a4d] transition-all text-lg font-semibold"
              >
                New Ticket
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
