'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface EmployeeInfo {
  id: string;
  name: string;
  username: string;
  counterNumber: number;
  role: string;
}

interface TicketInfo {
  number: number;
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
  const [lastCompleted, setLastCompleted] = useState<{ number: number; category?: string; waitTime?: number; serveTime?: number; createdAt?: string } | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterNumber: data.employee.counterNumber, employeeName: data.employee.name }),
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

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets');
      const data = await res.json();
      setWaitingCount(data.waiting?.length || 0);
      setServedCount(data.served?.length || 0);
      if (employee) {
        const s = data.serving?.find((t: { counterNumber: number }) => t.counterNumber === employee.counterNumber);
        if (s) setCurrentTicket({ number: s.number, category: s.category, recallCount: s.recallCount, createdAt: s.createdAt, servedAt: s.servedAt });
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

  useEffect(() => {
    if (!employee) return;
    fetchStats();
    fetchMyStats();
    const eventSource = new EventSource('/api/sse');
    eventSource.addEventListener('ticket-called', (e) => {
      const data = JSON.parse(e.data);
      if (data.counterNumber === employee.counterNumber) {
        setCurrentTicket({ number: data.ticket.number, category: data.ticket.category, recallCount: data.ticket.recallCount, createdAt: data.ticket.createdAt, servedAt: data.ticket.servedAt });
      }
      setWaitingCount(data.waitingCount);
      setServedCount(data.servedCount);
    });
    eventSource.addEventListener('ticket-created', () => fetchStats());
    eventSource.addEventListener('ticket-completed', (e) => {
      const data = JSON.parse(e.data);
      if (data.counterNumber === employee.counterNumber) setCurrentTicket(null);
      setWaitingCount(data.waitingCount);
      setServedCount(data.servedCount);
    });
    eventSource.addEventListener('ticket-skipped', (e) => {
      const data = JSON.parse(e.data);
      if (data.counterNumber === employee.counterNumber) setCurrentTicket(null);
    });
    eventSource.addEventListener('ticket-transferred', (e) => {
      const data = JSON.parse(e.data);
      if (data.fromCounter === employee.counterNumber) setCurrentTicket(null);
      if (data.toCounter === employee.counterNumber && data.ticket) {
        setCurrentTicket({ number: data.ticket.number, category: data.ticket.category });
      }
      fetchStats();
    });
    eventSource.addEventListener('ticket-auto-cancelled', (e) => {
      const data = JSON.parse(e.data);
      if (data.counterNumber === employee.counterNumber) {
        setCurrentTicket(null);
        alert(`Ticket #${data.ticketNumber} was auto-cancelled (recall limit reached)`);
      }
    });
    eventSource.addEventListener('queue-reset', () => { setCurrentTicket(null); setWaitingCount(0); setServedCount(0); });
    return () => eventSource.close();
  }, [employee, fetchStats, fetchMyStats]);

  const callNext = async () => {
    if (!employee) return;
    setLoading('next');
    try {
      const res = await fetch('/api/counter/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterNumber: employee.counterNumber }),
      });
      const data = await res.json();
      if (data.ticket) {
        setCurrentTicket({ number: data.ticket.number, category: data.ticket.category, recallCount: data.ticket.recallCount, createdAt: data.ticket.createdAt, servedAt: data.ticket.servedAt });
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterNumber: employee.counterNumber }),
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterNumber: employee.counterNumber }),
      });
      const data = await res.json();
      if (data.ticket) {
        const t = data.ticket;
        const waitTime = t.servedAt && t.createdAt ? Math.round((new Date(t.servedAt).getTime() - new Date(t.createdAt).getTime()) / 60000) : 0;
        const serveTime = t.completedAt && t.servedAt ? Math.round((new Date(t.completedAt).getTime() - new Date(t.servedAt).getTime()) / 60000) : 0;
        setLastCompleted({ number: t.number, category: t.category, waitTime, serveTime, createdAt: t.createdAt });
        setShowReceipt(true);
      }
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterNumber: employee.counterNumber }),
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterNumber: employee.counterNumber, targetCounter: parseInt(targetCounter) }),
      });
      setCurrentTicket(null);
      setShowTransfer(false);
      setTargetCounter('');
    } catch (e) { console.error(e); }
    setLoading('');
  };

  const printReceipt = () => {
    if (!receiptRef.current) return;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Receipt</title><style>
      body { font-family: 'Courier New', monospace; padding: 20px; max-width: 300px; margin: 0 auto; }
      .center { text-align: center; }
      .bold { font-weight: bold; }
      .line { border-top: 1px dashed #000; margin: 10px 0; }
      .row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 14px; }
    </style></head><body>
      <div class="center"><h2 style="color:#9C213F;margin:0">AUIB</h2><small>American University in Iraq, Baghdad</small></div>
      <div class="line"></div>
      <div class="center bold" style="font-size:24px;margin:10px 0">Ticket #${lastCompleted?.number}</div>
      ${lastCompleted?.category ? `<div class="center" style="margin-bottom:10px">${lastCompleted.category}</div>` : ''}
      <div class="line"></div>
      <div class="row"><span>Counter:</span><span>${employee?.counterNumber}</span></div>
      <div class="row"><span>Wait Time:</span><span>${lastCompleted?.waitTime} min</span></div>
      <div class="row"><span>Serve Time:</span><span>${lastCompleted?.serveTime} min</span></div>
      <div class="row"><span>Date:</span><span>${lastCompleted?.createdAt ? new Date(lastCompleted.createdAt).toLocaleDateString() : ''}</span></div>
      <div class="row"><span>Time:</span><span>${lastCompleted?.createdAt ? new Date(lastCompleted.createdAt).toLocaleTimeString() : ''}</span></div>
      <div class="line"></div>
      <div class="center"><small>Thank you for visiting AUIB</small></div>
    </body></html>`);
    w.document.close();
    w.print();
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
            <div className="text-5xl font-black text-[#9C213F] tracking-tight">AUIB</div>
            <div className="text-gray-500 text-sm tracking-widest uppercase mt-1">Counter Login</div>
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
          <div>
            <div className="text-3xl font-black text-[#9C213F] tracking-tight">AUIB</div>
            <div className="text-gray-500 text-sm">Counter {employee.counterNumber}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-300 font-medium">{employee.name}</div>
            <button onClick={logout} className="text-xs text-[#9C213F] hover:text-[#b82a4d] transition-colors">Sign Out</button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6 animate-slide-up" style={{ animationDelay: '0.05s' }}>
          {[
            { label: 'Waiting', value: waitingCount, color: 'text-[#D4A843]' },
            { label: 'Served Today', value: servedCount, color: 'text-green-400' },
            { label: 'Current', value: currentTicket?.number || '—', color: 'text-[#9C213F]' },
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
          <div className="glass-card-sm p-3 mb-4 flex items-center justify-center gap-6 text-xs text-gray-400 animate-slide-up" style={{ animationDelay: '0.07s' }}>
            <span>📊 Avg serve time: <strong className="text-white">{myStats.avgServeTime} min</strong></span>
          </div>
        )}

        {/* Current ticket */}
        <div className="glass-card p-10 text-center mb-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="text-sm text-gray-500 uppercase tracking-wider mb-3">Now Serving</div>
          <div className={`text-8xl font-black ${currentTicket ? 'animate-number-glow' : 'text-gray-700'}`} style={currentTicket ? { textShadow: '0 0 30px rgba(156,33,63,0.4)' } : {}}>
            {currentTicket?.number || '—'}
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
            <span className="text-sm text-gray-400">Transfer to counter:</span>
            <input type="number" value={targetCounter} onChange={(e) => setTargetCounter(e.target.value)} placeholder="#" className="w-20 p-2 rounded-lg input-dark text-center" />
            <button onClick={transfer} disabled={!targetCounter || loading === 'transfer'} className="px-4 py-2 rounded-lg btn-crimson text-sm font-medium text-white disabled:opacity-50">
              {loading === 'transfer' ? '...' : 'Send'}
            </button>
            <button onClick={() => setShowTransfer(false)} className="text-gray-500 hover:text-white text-sm">Cancel</button>
          </div>
        )}

        <button onClick={complete} disabled={!currentTicket || loading === 'complete'} className="w-full py-4 rounded-2xl bg-green-600/20 border border-green-500/20 hover:bg-green-600/30 transition-all text-lg font-semibold text-green-400 disabled:opacity-30 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          ✓ Complete & Free Counter
        </button>

        {/* Receipt modal */}
        {showReceipt && lastCompleted && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowReceipt(false)}>
            <div className="glass-card p-8 max-w-sm w-full animate-slide-up" onClick={(e) => e.stopPropagation()}>
              <div ref={receiptRef} className="text-center">
                <div className="text-[#9C213F] text-2xl font-black mb-1">AUIB</div>
                <div className="text-xs text-gray-500 mb-4">Service Receipt</div>
                <div className="text-4xl font-black text-white mb-2">#{lastCompleted.number}</div>
                {lastCompleted.category && <div className="text-sm text-[#D4A843] mb-4">{lastCompleted.category}</div>}
                <div className="h-px bg-white/10 mb-4" />
                <div className="space-y-2 text-sm text-left">
                  <div className="flex justify-between"><span className="text-gray-500">Counter</span><span>{employee.counterNumber}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Wait Time</span><span>{lastCompleted.waitTime} min</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Serve Time</span><span>{lastCompleted.serveTime} min</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Date</span><span>{lastCompleted.createdAt ? new Date(lastCompleted.createdAt).toLocaleDateString() : ''}</span></div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={printReceipt} className="flex-1 py-3 rounded-xl btn-glass text-sm font-medium">🖨️ Print Receipt</button>
                <button onClick={() => setShowReceipt(false)} className="flex-1 py-3 rounded-xl btn-crimson text-sm font-medium text-white">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
