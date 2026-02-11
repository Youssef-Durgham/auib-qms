'use client';

import { useState, useEffect, useCallback } from 'react';

interface EmployeeInfo {
  id: string;
  name: string;
  username: string;
  counterNumber: number;
  role: string;
}

export default function CounterPage() {
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [currentTicket, setCurrentTicket] = useState<number | null>(null);
  const [waitingCount, setWaitingCount] = useState(0);
  const [servedCount, setServedCount] = useState(0);
  const [loading, setLoading] = useState('');

  // Check for existing session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('qms-token');
    if (savedToken) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${savedToken}` } })
        .then((r) => r.ok ? r.json() : Promise.reject())
        .then((data) => {
          setEmployee(data);
          setToken(savedToken);
        })
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
      if (!res.ok) {
        setLoginError(data.error || 'Login failed');
        setLoginLoading(false);
        return;
      }
      localStorage.setItem('qms-token', data.token);
      setToken(data.token);
      setEmployee(data.employee);

      // Open counter
      await fetch('/api/counter/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterNumber: data.employee.counterNumber, employeeName: data.employee.name }),
      });
    } catch {
      setLoginError('Connection error');
    }
    setLoginLoading(false);
  };

  const logout = async () => {
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
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
        if (s) setCurrentTicket(s.number);
      }
    } catch (e) {
      console.error(e);
    }
  }, [employee]);

  useEffect(() => {
    if (!employee) return;
    fetchStats();
    const eventSource = new EventSource('/api/sse');
    eventSource.addEventListener('ticket-called', (e) => {
      const data = JSON.parse(e.data);
      if (data.counterNumber === employee.counterNumber) setCurrentTicket(data.ticket.number);
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
    eventSource.addEventListener('queue-reset', () => {
      setCurrentTicket(null);
      setWaitingCount(0);
      setServedCount(0);
    });
    return () => eventSource.close();
  }, [employee, fetchStats]);

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
      setCurrentTicket(data.ticket?.number || null);
      if (!data.ticket) alert('No tickets waiting');
    } catch (e) { console.error(e); }
    setLoading('');
  };

  const recall = async () => {
    if (!employee) return;
    setLoading('recall');
    try {
      await fetch('/api/counter/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterNumber: employee.counterNumber }),
      });
    } catch (e) { console.error(e); }
    setLoading('');
  };

  const complete = async () => {
    if (!employee) return;
    setLoading('complete');
    try {
      await fetch('/api/counter/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterNumber: employee.counterNumber }),
      });
      setCurrentTicket(null);
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
            <div className="text-5xl font-black text-[#9C213F] tracking-tight">AUIB</div>
            <div className="text-gray-500 text-sm tracking-widest uppercase mt-1">Counter Login</div>
          </div>
          <div className="glass-card p-8 space-y-5">
            {loginError && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                {loginError}
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && login()}
                placeholder="Enter username"
                className="w-full p-4 rounded-xl input-dark text-lg"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && login()}
                placeholder="Enter password"
                className="w-full p-4 rounded-xl input-dark text-lg"
              />
            </div>
            <button
              onClick={login}
              disabled={loginLoading || !username || !password}
              className="w-full py-4 rounded-xl btn-crimson text-lg font-semibold text-white disabled:opacity-50"
            >
              {loginLoading ? 'Logging in...' : 'Sign In'}
            </button>
          </div>
          <div className="text-center mt-4 text-xs text-gray-600">
            Contact admin for account credentials
          </div>
        </div>
      </div>
    );
  }

  // Dashboard
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
            <button onClick={logout} className="text-xs text-[#9C213F] hover:text-[#b82a4d] transition-colors">
              Sign Out
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6 animate-slide-up" style={{ animationDelay: '0.05s' }}>
          {[
            { label: 'Waiting', value: waitingCount, color: 'text-[#D4A843]' },
            { label: 'Served Today', value: servedCount, color: 'text-green-400' },
            { label: 'Current', value: currentTicket || '—', color: 'text-[#9C213F]' },
          ].map((stat) => (
            <div key={stat.label} className="glass-card-sm p-4 text-center">
              <div className="text-xs text-gray-500 uppercase tracking-wider">{stat.label}</div>
              <div className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Current ticket */}
        <div className="glass-card p-10 text-center mb-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="text-sm text-gray-500 uppercase tracking-wider mb-3">Now Serving</div>
          <div
            className={`text-8xl font-black ${currentTicket ? 'animate-number-glow' : 'text-gray-700'}`}
            style={currentTicket ? { textShadow: '0 0 30px rgba(156,33,63,0.4)' } : {}}
          >
            {currentTicket || '—'}
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 mb-4 animate-slide-up" style={{ animationDelay: '0.15s' }}>
          <button
            onClick={callNext}
            disabled={loading === 'next'}
            className="py-6 rounded-2xl btn-crimson text-xl font-bold text-white disabled:opacity-50"
          >
            {loading === 'next' ? '...' : '▶ Next Ticket'}
          </button>
          <button
            onClick={recall}
            disabled={!currentTicket || loading === 'recall'}
            className="py-6 rounded-2xl btn-glass text-xl font-bold disabled:opacity-30"
          >
            {loading === 'recall' ? '...' : '🔊 Recall'}
          </button>
        </div>

        <button
          onClick={complete}
          disabled={!currentTicket || loading === 'complete'}
          className="w-full py-4 rounded-2xl bg-green-600/20 border border-green-500/20 hover:bg-green-600/30 transition-all text-lg font-semibold text-green-400 disabled:opacity-30 mb-3 animate-slide-up"
          style={{ animationDelay: '0.2s' }}
        >
          ✓ Complete & Free Counter
        </button>
      </div>
    </div>
  );
}
