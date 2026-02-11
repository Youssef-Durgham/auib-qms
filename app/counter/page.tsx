'use client';

import { useState, useEffect, useCallback } from 'react';

export default function CounterPage() {
  const [counterNumber, setCounterNumber] = useState<number | null>(null);
  const [employeeName, setEmployeeName] = useState('');
  const [currentTicket, setCurrentTicket] = useState<number | null>(null);
  const [waitingCount, setWaitingCount] = useState(0);
  const [servedCount, setServedCount] = useState(0);
  const [loading, setLoading] = useState('');
  const [selectedCounter, setSelectedCounter] = useState(1);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets');
      const data = await res.json();
      setWaitingCount(data.waiting?.length || 0);
      setServedCount(data.served?.length || 0);
      // Check if our counter has a serving ticket
      if (counterNumber) {
        const servingForCounter = data.serving?.find((t: { counterNumber: number }) => t.counterNumber === counterNumber);
        if (servingForCounter) {
          setCurrentTicket(servingForCounter.number);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [counterNumber]);

  useEffect(() => {
    if (!counterNumber) return;
    fetchStats();
    const eventSource = new EventSource('/api/sse');
    eventSource.addEventListener('ticket-called', (e) => {
      const data = JSON.parse(e.data);
      if (data.counterNumber === counterNumber) {
        setCurrentTicket(data.ticket.number);
      }
      setWaitingCount(data.waitingCount);
      setServedCount(data.servedCount);
    });
    eventSource.addEventListener('ticket-created', () => fetchStats());
    eventSource.addEventListener('ticket-completed', (e) => {
      const data = JSON.parse(e.data);
      if (data.counterNumber === counterNumber) {
        setCurrentTicket(null);
      }
      setWaitingCount(data.waitingCount);
      setServedCount(data.servedCount);
    });
    eventSource.addEventListener('queue-reset', () => {
      setCurrentTicket(null);
      setWaitingCount(0);
      setServedCount(0);
    });
    return () => eventSource.close();
  }, [counterNumber, fetchStats]);

  const openCounter = async () => {
    try {
      await fetch('/api/counter/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterNumber: selectedCounter, employeeName }),
      });
      setCounterNumber(selectedCounter);
    } catch (e) {
      console.error(e);
      alert('Failed to open counter');
    }
  };

  const callNext = async () => {
    setLoading('next');
    try {
      const res = await fetch('/api/counter/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterNumber }),
      });
      const data = await res.json();
      setCurrentTicket(data.ticket?.number || null);
      if (!data.ticket) alert('No tickets waiting');
    } catch (e) {
      console.error(e);
    }
    setLoading('');
  };

  const recall = async () => {
    setLoading('recall');
    try {
      await fetch('/api/counter/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterNumber }),
      });
    } catch (e) {
      console.error(e);
    }
    setLoading('');
  };

  const complete = async () => {
    setLoading('complete');
    try {
      await fetch('/api/counter/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterNumber }),
      });
      setCurrentTicket(null);
    } catch (e) {
      console.error(e);
    }
    setLoading('');
  };

  const resetQueue = async () => {
    if (!confirm('Reset entire queue? This cannot be undone.')) return;
    try {
      await fetch('/api/reset', { method: 'POST' });
      setCurrentTicket(null);
    } catch (e) {
      console.error(e);
    }
  };

  // Login screen
  if (!counterNumber) {
    return (
      <div className="min-h-screen bg-[#273237] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-4xl font-bold text-[#9C213F] mb-2">AUIB</div>
            <div className="text-gray-400">Counter Login</div>
          </div>
          <div className="rounded-3xl bg-[#1a2328]/80 border border-white/10 backdrop-blur-xl p-8 space-y-6">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Counter Number</label>
              <select
                value={selectedCounter}
                onChange={(e) => setSelectedCounter(Number(e.target.value))}
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white text-lg"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n} className="bg-[#273237]">
                    Counter {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Employee Name (optional)</label>
              <input
                type="text"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="Your name"
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white"
              />
            </div>
            <button
              onClick={openCounter}
              className="w-full py-4 rounded-xl bg-[#9C213F] hover:bg-[#b82a4d] transition-all text-lg font-semibold"
            >
              Open Counter
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="min-h-screen bg-[#273237] text-white p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-3xl font-bold text-[#9C213F]">AUIB</div>
            <div className="text-gray-400">Counter {counterNumber}</div>
          </div>
          <div className="text-right text-sm text-gray-500">
            {employeeName && <div>{employeeName}</div>}
            <button onClick={() => setCounterNumber(null)} className="text-[#9C213F] hover:underline">
              Logout
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl bg-[#1a2328]/80 border border-white/10 p-4 text-center">
            <div className="text-sm text-gray-400">Waiting</div>
            <div className="text-3xl font-bold text-yellow-400">{waitingCount}</div>
          </div>
          <div className="rounded-2xl bg-[#1a2328]/80 border border-white/10 p-4 text-center">
            <div className="text-sm text-gray-400">Served Today</div>
            <div className="text-3xl font-bold text-green-400">{servedCount}</div>
          </div>
          <div className="rounded-2xl bg-[#1a2328]/80 border border-white/10 p-4 text-center">
            <div className="text-sm text-gray-400">Current</div>
            <div className="text-3xl font-bold text-[#9C213F]">{currentTicket || '—'}</div>
          </div>
        </div>

        {/* Current ticket */}
        <div className="rounded-3xl bg-[#1a2328]/80 border border-white/10 backdrop-blur-xl p-8 text-center mb-6">
          <div className="text-gray-400 text-lg mb-2">Now Serving</div>
          <div className="text-8xl font-black" style={{ textShadow: '0 0 30px rgba(156,33,63,0.4)' }}>
            {currentTicket || '—'}
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={callNext}
            disabled={loading === 'next'}
            className="py-6 rounded-2xl bg-[#9C213F] hover:bg-[#b82a4d] active:scale-95 transition-all text-xl font-bold disabled:opacity-50 shadow-lg shadow-[#9C213F]/20"
          >
            {loading === 'next' ? '...' : '▶ Next Ticket'}
          </button>
          <button
            onClick={recall}
            disabled={!currentTicket || loading === 'recall'}
            className="py-6 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-xl font-bold disabled:opacity-30"
          >
            {loading === 'recall' ? '...' : '🔊 Recall'}
          </button>
        </div>

        <button
          onClick={complete}
          disabled={!currentTicket || loading === 'complete'}
          className="w-full py-4 rounded-2xl bg-green-600/80 hover:bg-green-600 active:scale-95 transition-all text-lg font-semibold disabled:opacity-30 mb-4"
        >
          ✓ Complete & Free Counter
        </button>

        <button
          onClick={resetQueue}
          className="w-full py-3 rounded-xl bg-red-900/30 hover:bg-red-900/50 transition-all text-sm text-red-400"
        >
          Reset Queue
        </button>
      </div>
    </div>
  );
}
