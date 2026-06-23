'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ticketLabel } from '@/app/lib/helpers';

interface EmployeeInfo {
  id: string;
  name: string;
  username: string;
  counterNumber: number;
  role: string;
  categories?: string[];
}

interface TicketInfo {
  number: number;
  prefix?: string;
  typeSeq?: number;
  category?: string;
  recallCount?: number;
  createdAt?: string;
  servedAt?: string;
}

export default function CounterPage() {
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [currentTicket, setCurrentTicket] = useState<TicketInfo | null>(null);
  const [waitingCount, setWaitingCount] = useState(0);
  const [servedCount, setServedCount] = useState(0);
  const [loading, setLoading] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [targetCounter, setTargetCounter] = useState('');
  const [myStats, setMyStats] = useState<{ ticketsServed: number; avgServeTime: number } | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('qms-token');
    if (savedToken) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${savedToken}` } })
        .then((r) => r.ok ? r.json() : Promise.reject())
        .then((data) => { setEmployee(data); setToken(savedToken); })
        .catch(() => localStorage.removeItem('qms-token'));
    }
  }, []);

  const login = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setLoginError(data.error || 'Login failed'); setLoginLoading(false); return; }
      localStorage.setItem('qms-token', data.token);
      setToken(data.token);
      setEmployee(data.employee);
      await fetch('/api/counter/open', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.token}` },
      });
    } catch { setLoginError('Connection error'); }
    setLoginLoading(false);
  };

  const logout = async () => {
    if (token) {
      await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    }
    localStorage.removeItem('qms-token');
    setEmployee(null);
    setToken(null);
  };

  // Called when an authenticated request comes back 401 (session expired/removed).
  // Return to the login screen with a clear message instead of a misleading
  // "No tickets waiting" alert.
  const handleSessionExpired = useCallback(() => {
    localStorage.removeItem('qms-token');
    setEmployee(null);
    setToken(null);
    setLoading('');
    alert('انتهت الجلسة. الرجاء تسجيل الدخول من جديد.\nالسنشن خلصت — Session expired, please log in again.');
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets');
      const data = await res.json();
      // Only count tickets this employee is allowed to serve. An employee with
      // no assigned services sees the full queue (handles everything).
      const empCats: string[] = employee?.categories || [];
      const myWaiting = (data.waiting || []).filter(
        (t: { category?: string }) => empCats.length === 0 || (t.category != null && empCats.includes(t.category))
      );
      setWaitingCount(myWaiting.length);
      setServedCount(data.served?.length || 0);
      if (employee) {
        const s = data.serving?.find((t: { counterNumber: number }) => t.counterNumber === employee.counterNumber);
        if (s) setCurrentTicket({ number: s.number, prefix: s.prefix, typeSeq: s.typeSeq, category: s.category, recallCount: s.recallCount, createdAt: s.createdAt, servedAt: s.servedAt });
        else setCurrentTicket(null);
      }
    } catch (e) { console.error(e); }
  }, [employee]);

  // Fetch employee performance stats
  const fetchMyStats = useCallback(async () => {
    if (!employee) return;
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();
      const me = data.employeeStats?.find((e: { counterNumber: number }) => e.counterNumber === employee.counterNumber);
      if (me) setMyStats({ ticketsServed: me.ticketsServed, avgServeTime: me.avgServeTime });
    } catch { /* ignore */ }
  }, [employee]);

  const esRef = useRef<EventSource | null>(null);
  const lastMsgRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!employee) return;
    fetchStats();
    fetchMyStats();
    const markAlive = () => { lastMsgRef.current = Date.now(); };

    const connect = () => {
      try { esRef.current?.close(); } catch { /* ignore */ }
      const es = new EventSource('/api/sse');
      esRef.current = es;
      markAlive();
      es.onopen = () => { markAlive(); fetchStats(); };
      es.addEventListener('connected', () => { markAlive(); fetchStats(); });
      es.addEventListener('heartbeat', markAlive);

      es.addEventListener('ticket-called', (e) => {
        markAlive();
        const data = JSON.parse(e.data);
        if (data.counterNumber === employee.counterNumber) {
          setCurrentTicket({ number: data.ticket.number, prefix: data.ticket.prefix, typeSeq: data.ticket.typeSeq, category: data.ticket.category, recallCount: data.ticket.recallCount, createdAt: data.ticket.createdAt, servedAt: data.ticket.servedAt });
        }
        // Recompute against this employee's services rather than trusting the
        // broadcast's global counts.
        fetchStats();
      });
      es.addEventListener('ticket-created', () => { markAlive(); fetchStats(); });
      es.addEventListener('ticket-completed', (e) => {
        markAlive();
        const data = JSON.parse(e.data);
        if (data.counterNumber === employee.counterNumber) setCurrentTicket(null);
        fetchStats();
      });
      es.addEventListener('ticket-skipped', (e) => {
        markAlive();
        const data = JSON.parse(e.data);
        if (data.counterNumber === employee.counterNumber) setCurrentTicket(null);
      });
      es.addEventListener('ticket-transferred', (e) => {
        markAlive();
        const data = JSON.parse(e.data);
        if (data.fromCounter === employee.counterNumber) setCurrentTicket(null);
        if (data.toCounter === employee.counterNumber && data.ticket) {
          setCurrentTicket({ number: data.ticket.number, prefix: data.ticket.prefix, typeSeq: data.ticket.typeSeq, category: data.ticket.category });
        }
        fetchStats();
      });
      es.addEventListener('ticket-auto-cancelled', (e) => {
        markAlive();
        const data = JSON.parse(e.data);
        if (data.counterNumber === employee.counterNumber) {
          setCurrentTicket(null);
          alert(`Ticket #${data.ticketNumber} was auto-cancelled (recall limit reached)`);
        }
      });
      es.addEventListener('queue-reset', () => { markAlive(); setCurrentTicket(null); setWaitingCount(0); setServedCount(0); });
    };

    connect();
    const polling = setInterval(fetchStats, 12000);
    const watchdog = setInterval(() => {
      if (Date.now() - lastMsgRef.current > 45000) connect();
    }, 10000);

    return () => {
      clearInterval(polling);
      clearInterval(watchdog);
      try { esRef.current?.close(); } catch { /* ignore */ }
    };
  }, [employee, fetchStats, fetchMyStats]);

  // Heartbeat: while the counter is open, periodically ping an authenticated endpoint
  // so the session's sliding expiry keeps refreshing — a page left open all shift no
  // longer hits the 24h TTL. If the session has already died, drop to the login screen
  // (so the operator sees a clear "log in again", not a confusing "No tickets waiting").
  useEffect(() => {
    if (!token || !employee) return;
    const ping = async () => {
      try {
        const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 401) handleSessionExpired();
      } catch { /* transient network error — retry on the next tick */ }
    };
    const id = setInterval(ping, 5 * 60 * 1000); // every 5 minutes
    return () => clearInterval(id);
  }, [token, employee, handleSessionExpired]);

  const callNext = async () => {
    if (!employee) return;
    setLoading('next');
    try {
      const res = await fetch('/api/counter/next', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { handleSessionExpired(); return; }
      const data = await res.json();
      if (data.ticket) {
        setCurrentTicket({ number: data.ticket.number, prefix: data.ticket.prefix, typeSeq: data.ticket.typeSeq, category: data.ticket.category, recallCount: data.ticket.recallCount, createdAt: data.ticket.createdAt, servedAt: data.ticket.servedAt });
      } else {
        setCurrentTicket(null);
        alert('No tickets waiting');
      }
    } catch (e) { console.error(e); }
    setLoading('');
  };

  const recall = async () => {
    if (!employee) return;
    setLoading('recall');
    try {
      const res = await fetch('/api/counter/recall', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.autoCancelled) {
        setCurrentTicket(null);
        alert(`Ticket #${data.ticketNumber} auto-cancelled after ${data.recallCount} recalls`);
      } else if (data.recallCount !== undefined && currentTicket) {
        setCurrentTicket({ ...currentTicket, recallCount: data.recallCount });
      }
    } catch (e) { console.error(e); }
    setLoading('');
  };

  const complete = async () => {
    if (!employee || !currentTicket) return;
    setLoading('complete');
    try {
      const res = await fetch('/api/counter/complete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await res.json().catch(() => ({}));
      // Just free the counter — no receipt popup.
      setCurrentTicket(null);
      fetchMyStats();
    } catch (e) { console.error(e); }
    setLoading('');
  };

  const skip = async () => {
    if (!employee) return;
    if (!confirm('Skip this ticket (mark as no-show)?')) return;
    setLoading('skip');
    try {
      await fetch('/api/counter/skip', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setCurrentTicket(null);
    } catch (e) { console.error(e); }
    setLoading('');
  };

  const transfer = async () => {
    if (!employee || !targetCounter) return;
    setLoading('transfer');
    try {
      await fetch('/api/counter/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetCounter: parseInt(targetCounter) }),
      });
      setCurrentTicket(null);
      setShowTransfer(false);
      setTargetCounter('');
    } catch (e) { console.error(e); }
    setLoading('');
  };

  // Login screen
  if (!employee) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[#9C213F]/5 rounded-full blur-[100px]" />
        </div>
        <div className="relative z-10 w-full max-w-sm animate-slide-up">
          <div className="text-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/auib-logo.png" alt="AUIB" className="mx-auto mb-3 h-16 w-auto" />
            <div className="text-gray-500 text-xs tracking-[0.3em] uppercase">Counter Login</div>
          </div>
          <div className="glass-card p-8 space-y-5">
            {loginError && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">{loginError}</div>
            )}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} placeholder="Enter username" className="w-full p-4 rounded-xl input-dark text-lg" />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} placeholder="Enter password" className="w-full p-4 rounded-xl input-dark text-lg" />
            </div>
            <button onClick={login} disabled={loginLoading || !username || !password} className="w-full py-4 rounded-xl btn-crimson text-lg font-semibold text-white disabled:opacity-50">
              {loginLoading ? 'Logging in...' : 'Sign In'}
            </button>
          </div>
          <div className="text-center mt-4 text-xs text-gray-600">Contact admin for account credentials</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-slide-up">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/auib-logo.png" alt="AUIB" className="h-10 w-auto" />
            <div className="border-l border-gray-300 pl-3">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Counter</div>
              <div className="text-xl font-black text-[#9C213F]">#{employee.counterNumber}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-700 font-medium">{employee.name}</div>
            <button onClick={logout} className="text-xs text-[#9C213F] hover:text-[#b82a4d] transition-colors">Sign Out</button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6 animate-slide-up" style={{ animationDelay: '0.05s' }}>
          {[
            { label: 'Waiting', value: waitingCount, color: 'text-[#D4A843]' },
            { label: 'Served Today', value: servedCount, color: 'text-green-400' },
            { label: 'Current', value: currentTicket ? ticketLabel(currentTicket) : '—', color: 'text-[#9C213F]' },
            { label: 'My Served', value: myStats?.ticketsServed ?? '—', color: 'text-blue-400' },
          ].map((stat) => (
            <div key={stat.label} className="glass-card-sm p-4 text-center">
              <div className="text-xs text-gray-500 uppercase tracking-wider">{stat.label}</div>
              <div className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Personal stats */}
        {myStats && myStats.ticketsServed > 0 && (
          <div className="glass-card-sm p-3 mb-4 flex items-center justify-center gap-6 text-xs text-gray-500 animate-slide-up" style={{ animationDelay: '0.07s' }}>
            <span>📊 Avg serve time: <strong className="text-gray-900">{myStats.avgServeTime} min</strong></span>
          </div>
        )}

        {/* Current ticket */}
        <div className="glass-card p-10 text-center mb-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="text-sm text-gray-500 uppercase tracking-wider mb-3">Now Serving</div>
          <div className={`text-8xl font-black ${currentTicket ? 'text-[#9C213F]' : 'text-gray-300'}`} style={currentTicket ? { textShadow: '0 4px 20px rgba(156,33,63,0.18)' } : {}}>
            {currentTicket ? ticketLabel(currentTicket) : '—'}
          </div>
          {currentTicket?.category && (
            <div className="mt-3 inline-block px-4 py-1.5 rounded-full bg-[#D4A843]/10 border border-[#D4A843]/20 text-[#D4A843] text-sm font-medium">
              {currentTicket.category}
            </div>
          )}
          {currentTicket?.recallCount !== undefined && currentTicket.recallCount > 0 && (
            <div className="mt-2 text-xs text-orange-400">
              Recalled {currentTicket.recallCount}/3 times {currentTicket.recallCount >= 2 && '⚠️'}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 mb-3 animate-slide-up" style={{ animationDelay: '0.15s' }}>
          <button onClick={callNext} disabled={loading === 'next'} className="py-6 rounded-2xl btn-crimson text-xl font-bold text-white disabled:opacity-50">
            {loading === 'next' ? '...' : '▶ Next Ticket'}
          </button>
          <button onClick={recall} disabled={!currentTicket || loading === 'recall'} className="py-6 rounded-2xl btn-glass text-xl font-bold disabled:opacity-30">
            {loading === 'recall' ? '...' : '🔊 Recall'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3 animate-slide-up" style={{ animationDelay: '0.17s' }}>
          <button onClick={skip} disabled={!currentTicket || loading === 'skip'} className="py-4 rounded-2xl bg-orange-600/20 border border-orange-500/20 hover:bg-orange-600/30 transition-all text-lg font-semibold text-orange-400 disabled:opacity-30">
            ⏭ Skip (No-Show)
          </button>
          <button onClick={() => setShowTransfer(!showTransfer)} disabled={!currentTicket} className="py-4 rounded-2xl bg-blue-600/20 border border-blue-500/20 hover:bg-blue-600/30 transition-all text-lg font-semibold text-blue-400 disabled:opacity-30">
            🔄 Transfer
          </button>
        </div>

        {/* Transfer panel */}
        {showTransfer && currentTicket && (
          <div className="glass-card-sm p-4 mb-3 flex items-center gap-3 animate-fade-in">
            <span className="text-sm text-gray-600">Transfer to counter:</span>
            <input type="number" value={targetCounter} onChange={(e) => setTargetCounter(e.target.value)} placeholder="#" className="w-20 p-2 rounded-lg input-dark text-center" />
            <button onClick={transfer} disabled={!targetCounter || loading === 'transfer'} className="px-4 py-2 rounded-lg btn-crimson text-sm font-medium text-white disabled:opacity-50">
              {loading === 'transfer' ? '...' : 'Send'}
            </button>
            <button onClick={() => setShowTransfer(false)} className="text-gray-500 hover:text-[#9C213F] text-sm">Cancel</button>
          </div>
        )}

        <button onClick={complete} disabled={!currentTicket || loading === 'complete'} className="w-full py-5 rounded-2xl text-xl font-bold text-white shadow-lg transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed animate-slide-up" style={{ animationDelay: '0.2s', background: 'linear-gradient(135deg, #16a34a, #15803d)', boxShadow: '0 10px 25px -8px rgba(22,163,74,0.6)' }}>
          {loading === 'complete' ? '...' : '✓ Complete & Free Counter'}
        </button>
      </div>
    </div>
  );
}
