'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Employee {
  _id: string;
  username: string;
  name: string;
  counterNumber: number;
  role: string;
  active: boolean;
}

interface CounterInfo {
  number: number;
  employeeName: string;
  currentTicket: number | null;
  status: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [counters, setCounters] = useState<CounterInfo[]>([]);
  const [ticketStats, setTicketStats] = useState({ waiting: 0, serving: 0, served: 0, total: 0 });
  const [tab, setTab] = useState<'dashboard' | 'employees'>('dashboard');

  // Employee form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', password: '', name: '', counterNumber: '', role: 'employee' });
  const [formError, setFormError] = useState('');

  // Check auth
  useEffect(() => {
    const savedToken = localStorage.getItem('qms-token');
    if (savedToken) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${savedToken}` } })
        .then((r) => r.ok ? r.json() : Promise.reject())
        .then((data) => {
          if (data.role !== 'admin') { router.push('/'); return; }
          setUser(data);
          setToken(savedToken);
        })
        .catch(() => localStorage.removeItem('qms-token'));
    }
  }, [router]);

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
      if (!res.ok) { setLoginError(data.error); setLoginLoading(false); return; }
      if (data.employee.role !== 'admin') { setLoginError('Admin access required'); setLoginLoading(false); return; }
      localStorage.setItem('qms-token', data.token);
      setToken(data.token);
      setUser(data.employee);
    } catch {
      setLoginError('Connection error');
    }
    setLoginLoading(false);
  };

  const logout = () => {
    if (token) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    localStorage.removeItem('qms-token');
    setUser(null);
    setToken(null);
  };

  const fetchEmployees = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/employees', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setEmployees(data.employees || []);
    } catch (e) { console.error(e); }
  }, [token]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets');
      const data = await res.json();
      setTicketStats({
        waiting: data.waiting?.length || 0,
        serving: data.serving?.length || 0,
        served: data.served?.length || 0,
        total: data.total || 0,
      });
      // Extract counters from serving tickets
      const servingCounters = data.serving?.map((t: { counterNumber: number; number: number }) => ({
        number: t.counterNumber,
        employeeName: '',
        currentTicket: t.number,
        status: 'open',
      })) || [];
      setCounters(servingCounters);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetchEmployees();
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [token, fetchEmployees, fetchStats]);

  const saveEmployee = async () => {
    setFormError('');
    const payload = { ...form, counterNumber: parseInt(form.counterNumber), id: editId };
    try {
      const res = await fetch('/api/employees', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error); return; }
      setShowForm(false);
      setEditId(null);
      setForm({ username: '', password: '', name: '', counterNumber: '', role: 'employee' });
      fetchEmployees();
    } catch {
      setFormError('Failed to save');
    }
  };

  const deleteEmployee = async (id: string) => {
    if (!confirm('Delete this employee?')) return;
    await fetch('/api/employees', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    });
    fetchEmployees();
  };

  const resetQueue = async () => {
    if (!confirm('Reset the entire queue? This cannot be undone.')) return;
    await fetch('/api/reset', { method: 'POST' });
    fetchStats();
  };

  const seedAdmin = async () => {
    await fetch('/api/auth/seed', { method: 'POST' });
    alert('Admin account seeded (admin / admin123)');
  };

  // Login screen
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="text-center mb-8">
            <div className="text-5xl font-black text-[#9C213F] tracking-tight">AUIB</div>
            <div className="text-gray-500 text-sm tracking-widest uppercase mt-1">Admin Panel</div>
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
                type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && login()}
                className="w-full p-4 rounded-xl input-dark text-lg" placeholder="admin"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Password</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && login()}
                className="w-full p-4 rounded-xl input-dark text-lg" placeholder="••••••"
              />
            </div>
            <button
              onClick={login} disabled={loginLoading || !username || !password}
              className="w-full py-4 rounded-xl btn-crimson text-lg font-semibold text-white disabled:opacity-50"
            >
              {loginLoading ? 'Signing in...' : 'Sign In'}
            </button>
            <button onClick={seedAdmin} className="w-full py-2 text-xs text-gray-600 hover:text-gray-400 transition-colors">
              Seed default admin account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-slide-up">
          <div>
            <div className="text-3xl font-black text-[#9C213F] tracking-tight">AUIB</div>
            <div className="text-gray-500 text-sm">Administration</div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{user.name}</span>
            <button onClick={logout} className="text-xs text-[#9C213F] hover:text-[#b82a4d] transition-colors px-3 py-1.5 rounded-lg btn-glass">
              Sign Out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 animate-slide-up" style={{ animationDelay: '0.05s' }}>
          {(['dashboard', 'employees'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                tab === t ? 'bg-[#9C213F] text-white' : 'btn-glass text-gray-400'
              }`}
            >
              {t === 'dashboard' ? '📊 Dashboard' : '👥 Employees'}
            </button>
          ))}
        </div>

        {tab === 'dashboard' && (
          <div className="space-y-6 animate-fade-in">
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Waiting', value: ticketStats.waiting, color: 'text-[#D4A843]' },
                { label: 'Being Served', value: ticketStats.serving, color: 'text-blue-400' },
                { label: 'Served Today', value: ticketStats.served, color: 'text-green-400' },
                { label: 'Total Today', value: ticketStats.total, color: 'text-white' },
              ].map((s) => (
                <div key={s.label} className="glass-card-sm p-5 text-center">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">{s.label}</div>
                  <div className={`text-4xl font-bold mt-2 ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Active Counters */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-[#D4A843] mb-4">Active Counters</h3>
              {counters.length === 0 ? (
                <div className="text-gray-600 text-center py-6">No active counters</div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {counters.map((c) => (
                    <div key={c.number} className="glass-card-sm p-4 text-center">
                      <div className="text-xs text-gray-500">Counter {c.number}</div>
                      <div className="text-2xl font-bold text-[#9C213F] mt-1">{c.currentTicket || '—'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-[#D4A843] mb-4">Queue Actions</h3>
              <button
                onClick={resetQueue}
                className="px-6 py-3 rounded-xl bg-red-900/30 border border-red-500/20 hover:bg-red-900/50 transition-all text-red-400 text-sm font-medium"
              >
                🗑️ Reset Entire Queue
              </button>
            </div>
          </div>
        )}

        {tab === 'employees' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-[#D4A843]">Employee Accounts</h3>
              <button
                onClick={() => {
                  setEditId(null);
                  setForm({ username: '', password: '', name: '', counterNumber: '', role: 'employee' });
                  setShowForm(true);
                  setFormError('');
                }}
                className="px-5 py-2.5 rounded-xl btn-crimson text-sm font-medium text-white"
              >
                + Add Employee
              </button>
            </div>

            {/* Form modal */}
            {showForm && (
              <div className="glass-card p-6 space-y-4">
                <h4 className="font-semibold text-white">{editId ? 'Edit Employee' : 'New Employee'}</h4>
                {formError && (
                  <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{formError}</div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Name</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full p-3 rounded-lg input-dark" placeholder="Full name" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Username</label>
                    <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                      className="w-full p-3 rounded-lg input-dark" placeholder="username" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">
                      Password {editId && '(leave blank to keep)'}
                    </label>
                    <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full p-3 rounded-lg input-dark" placeholder="••••••" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Counter #</label>
                    <input type="number" value={form.counterNumber} onChange={(e) => setForm({ ...form, counterNumber: e.target.value })}
                      className="w-full p-3 rounded-lg input-dark" placeholder="1" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Role</label>
                    <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className="w-full p-3 rounded-lg input-dark">
                      <option value="employee">Employee</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={saveEmployee} className="px-6 py-2.5 rounded-xl btn-crimson text-sm font-medium text-white">
                    {editId ? 'Update' : 'Create'}
                  </button>
                  <button onClick={() => setShowForm(false)} className="px-6 py-2.5 rounded-xl btn-glass text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Employee list */}
            <div className="glass-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Username</th>
                    <th className="text-center px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Counter</th>
                    <th className="text-center px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="text-center px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-right px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp._id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-medium">{emp.name}</td>
                      <td className="px-6 py-4 text-gray-400 font-mono text-sm">{emp.username}</td>
                      <td className="px-6 py-4 text-center">{emp.counterNumber}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`text-xs px-2.5 py-1 rounded-full ${emp.role === 'admin' ? 'bg-[#D4A843]/20 text-[#D4A843]' : 'bg-white/5 text-gray-400'}`}>
                          {emp.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`w-2 h-2 rounded-full inline-block ${emp.active ? 'bg-green-400' : 'bg-gray-600'}`} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            setEditId(emp._id);
                            setForm({
                              username: emp.username,
                              password: '',
                              name: emp.name,
                              counterNumber: String(emp.counterNumber),
                              role: emp.role,
                            });
                            setShowForm(true);
                            setFormError('');
                          }}
                          className="text-xs text-gray-400 hover:text-white transition-colors mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteEmployee(emp._id)}
                          className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {employees.length === 0 && (
                <div className="text-center text-gray-600 py-12">No employees yet. Add one above.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
