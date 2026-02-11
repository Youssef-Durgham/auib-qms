'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface Employee {
  _id: string;
  username: string;
  name: string;
  counterNumber: number;
  role: string;
  active: boolean;
  categories?: string[];
}

interface CounterInfo {
  number: number;
  employeeName: string;
  currentTicket: number | null;
  status: string;
}

interface AnalyticsData {
  today: {
    total: number;
    served: number;
    waiting: number;
    cancelled: number;
    avgWaitTime: number;
    avgServeTime: number;
    peakHours: number[];
    counterBreakdown: Record<number, number>;
  };
  week: { date: string; total: number; served: number }[];
  employeeStats: { name: string; counterNumber: number; ticketsServed: number; avgServeTime: number }[];
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [counters, setCounters] = useState<CounterInfo[]>([]);
  const [ticketStats, setTicketStats] = useState({ waiting: 0, serving: 0, served: 0, total: 0 });
  const [tab, setTab] = useState<'dashboard' | 'employees' | 'categories' | 'analytics' | 'voice' | 'videos' | 'settings'>('dashboard');

  // Employee form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', password: '', name: '', counterNumber: '', role: 'employee', categories: [] as string[] });
  const [formError, setFormError] = useState('');

  // Voice settings
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [savedVoice, setSavedVoice] = useState('');
  const [voiceRate, setVoiceRate] = useState(0.85);
  const [voicePitch, setVoicePitch] = useState(1.05);
  const [previewText, setPreviewText] = useState('Attention please. Ticket number 42, you are now being served at counter number 3.');
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceSaved, setVoiceSaved] = useState(false);

  // Video management
  const [videoList, setVideoList] = useState<{ url: string; name: string; filename: string }[]>([]);
  const [videoUploading, setVideoUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [videoSaving, setVideoSaving] = useState(false);
  const [videoSaved, setVideoSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Categories
  const [categories, setCategories] = useState<string[]>(['Registration', 'Finance', 'IT Support', 'General Inquiry']);
  const [newCategory, setNewCategory] = useState('');
  const [editCatIdx, setEditCatIdx] = useState<number | null>(null);
  const [editCatVal, setEditCatVal] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [catSaved, setCatSaved] = useState(false);

  // Analytics
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // Settings: auto-reset, ticker messages
  const [autoResetTime, setAutoResetTime] = useState('00:00');
  const [tickerMessages, setTickerMessages] = useState<string[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [authChecked, setAuthChecked] = useState(false);

  // Load voices
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices();
      const v = all.filter((voice) => voice.lang.startsWith('en') || voice.lang.startsWith('ar'));
      if (v.length > 0) setVoices(v);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const fetchAllSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.voiceName) { setSelectedVoice(data.voiceName); setSavedVoice(data.voiceName); }
      if (data.voiceRate) setVoiceRate(parseFloat(data.voiceRate));
      if (data.voicePitch) setVoicePitch(parseFloat(data.voicePitch));
      if (data.categories) { try { setCategories(JSON.parse(data.categories)); } catch { /* */ } }
      if (data.autoResetTime) setAutoResetTime(data.autoResetTime);
      if (data.tickerMessages) { try { setTickerMessages(JSON.parse(data.tickerMessages)); } catch { /* */ } }
      try {
        const vRes = await fetch('/api/videos');
        const vData = await vRes.json();
        if (vData.videos) setVideoList(vData.videos);
      } catch { /* */ }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem('qms-token');
    if (!savedToken) { setAuthChecked(true); return; }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${savedToken}` } })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        if (data.role !== 'admin') { localStorage.removeItem('qms-token'); setAuthChecked(true); return; }
        setUser(data); setToken(savedToken); setAuthChecked(true);
      })
      .catch(() => { localStorage.removeItem('qms-token'); setAuthChecked(true); });
  }, []);

  const login = async () => {
    setLoginLoading(true); setLoginError('');
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (!res.ok) { setLoginError(data.error); setLoginLoading(false); return; }
      if (data.employee.role !== 'admin') { setLoginError('Admin access required'); setLoginLoading(false); return; }
      localStorage.setItem('qms-token', data.token); setToken(data.token); setUser(data.employee);
    } catch { setLoginError('Connection error'); }
    setLoginLoading(false);
  };

  const logout = () => {
    if (token) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    localStorage.removeItem('qms-token'); setUser(null); setToken(null);
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
      setTicketStats({ waiting: data.waiting?.length || 0, serving: data.serving?.length || 0, served: data.served?.length || 0, total: data.total || 0 });
      const servingCounters = data.serving?.map((t: { counterNumber: number; number: number }) => ({
        number: t.counterNumber, employeeName: '', currentTicket: t.number, status: 'open',
      })) || [];
      setCounters(servingCounters);
    } catch (e) { console.error(e); }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();
      setAnalytics(data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetchEmployees(); fetchStats(); fetchAllSettings(); fetchAnalytics();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [token, fetchEmployees, fetchStats, fetchAllSettings, fetchAnalytics]);

  const saveSetting = async (key: string, value: string) => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key, value }),
    });
  };

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
      setShowForm(false); setEditId(null);
      setForm({ username: '', password: '', name: '', counterNumber: '', role: 'employee', categories: [] });
      fetchEmployees();
    } catch { setFormError('Failed to save'); }
  };

  const deleteEmployee = async (id: string) => {
    if (!confirm('Delete this employee?')) return;
    await fetch('/api/employees', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id }) });
    fetchEmployees();
  };

  const resetQueue = async () => {
    if (!confirm('Reset the entire queue? This cannot be undone.')) return;
    await fetch('/api/reset', { method: 'POST' });
    fetchStats();
  };

  // Categories management
  const saveCategories = async (cats: string[]) => {
    setCatSaving(true);
    await saveSetting('categories', JSON.stringify(cats));
    setCategories(cats);
    setCatSaved(true);
    setTimeout(() => setCatSaved(false), 2000);
    setCatSaving(false);
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    await saveCategories([...categories, newCategory.trim()]);
    setNewCategory('');
  };

  const removeCategory = async (idx: number) => {
    await saveCategories(categories.filter((_, i) => i !== idx));
  };

  const updateCategory = async (idx: number) => {
    if (!editCatVal.trim()) return;
    const updated = [...categories];
    updated[idx] = editCatVal.trim();
    await saveCategories(updated);
    setEditCatIdx(null); setEditCatVal('');
  };

  // Voice
  const previewVoice = () => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(previewText);
    utterance.rate = voiceRate; utterance.pitch = voicePitch; utterance.volume = 1; utterance.lang = 'en-US';
    if (selectedVoice) { const v = voices.find((voice) => voice.name === selectedVoice); if (v) utterance.voice = v; }
    window.speechSynthesis.speak(utterance);
  };

  const saveVoiceSettings = async () => {
    setVoiceSaving(true);
    await Promise.all([
      saveSetting('voiceName', selectedVoice),
      saveSetting('voiceRate', String(voiceRate)),
      saveSetting('voicePitch', String(voicePitch)),
    ]);
    setSavedVoice(selectedVoice); setVoiceSaved(true);
    setTimeout(() => setVoiceSaved(false), 3000);
    setVoiceSaving(false);
  };

  // Videos
  const uploadVideo = async (file: File) => {
    setVideoUploading(true); setUploadProgress(`Uploading ${file.name}...`);
    try {
      const formData = new FormData(); formData.append('video', file);
      const res = await fetch('/api/videos', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Upload failed'); setVideoUploading(false); setUploadProgress(''); return; }
      const newList = [...videoList, data.video];
      setVideoList(newList); setUploadProgress('');
      await saveSetting('videos', JSON.stringify(newList));
    } catch { alert('Upload failed'); }
    setVideoUploading(false);
  };

  const removeVideo = async (index: number) => {
    const video = videoList[index];
    if (!confirm(`Delete "${video.name}"?`)) return;
    try {
      await fetch('/api/videos', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ filename: video.filename }) });
      const newList = videoList.filter((_, i) => i !== index);
      setVideoList(newList);
      await saveSetting('videos', JSON.stringify(newList));
    } catch (e) { console.error(e); }
  };

  const moveVideo = async (index: number, dir: -1 | 1) => {
    const newList = [...videoList]; const target = index + dir;
    if (target < 0 || target >= newList.length) return;
    [newList[index], newList[target]] = [newList[target], newList[index]];
    setVideoList(newList);
    await saveSetting('videos', JSON.stringify(newList));
  };

  // Settings save
  const saveSettings = async () => {
    setSettingsSaving(true);
    await Promise.all([
      saveSetting('autoResetTime', autoResetTime),
      saveSetting('tickerMessages', JSON.stringify(tickerMessages)),
    ]);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
    setSettingsSaving(false);
  };

  const seedAdmin = async () => {
    await fetch('/api/auth/seed', { method: 'POST' });
    alert('Admin account seeded (admin / admin123)');
  };

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-500">Loading...</div></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="text-center mb-8">
            <div className="text-5xl font-black text-[#9C213F] tracking-tight">AUIB</div>
            <div className="text-gray-500 text-sm tracking-widest uppercase mt-1">Admin Panel</div>
          </div>
          <div className="glass-card p-8 space-y-5">
            {loginError && <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">{loginError}</div>}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} className="w-full p-4 rounded-xl input-dark text-lg" placeholder="admin" />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} className="w-full p-4 rounded-xl input-dark text-lg" placeholder="••••••" />
            </div>
            <button onClick={login} disabled={loginLoading || !username || !password} className="w-full py-4 rounded-xl btn-crimson text-lg font-semibold text-white disabled:opacity-50">
              {loginLoading ? 'Signing in...' : 'Sign In'}
            </button>
            <button onClick={seedAdmin} className="w-full py-2 text-xs text-gray-600 hover:text-gray-400 transition-colors">Seed default admin account</button>
          </div>
        </div>
      </div>
    );
  }

  const allTabs = ['dashboard', 'employees', 'categories', 'analytics', 'voice', 'videos', 'settings'] as const;
  const tabLabels: Record<string, string> = { dashboard: '📊 Dashboard', employees: '👥 Employees', categories: '📂 Categories', analytics: '📈 Analytics', voice: '🔊 Voice', videos: '🎬 Videos', settings: '⚙️ Settings' };

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
            <button onClick={logout} className="text-xs text-[#9C213F] hover:text-[#b82a4d] transition-colors px-3 py-1.5 rounded-lg btn-glass">Sign Out</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap animate-slide-up" style={{ animationDelay: '0.05s' }}>
          {allTabs.map((t) => (
            <button key={t} onClick={() => { setTab(t); if (t === 'analytics') fetchAnalytics(); }}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === t ? 'bg-[#9C213F] text-white' : 'btn-glass text-gray-400'}`}>
              {tabLabels[t]}
            </button>
          ))}
        </div>

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
          <div className="space-y-6 animate-fade-in">
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
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-[#D4A843] mb-4">Queue Actions</h3>
              <button onClick={resetQueue} className="px-6 py-3 rounded-xl bg-red-900/30 border border-red-500/20 hover:bg-red-900/50 transition-all text-red-400 text-sm font-medium">
                🗑️ Reset Entire Queue
              </button>
            </div>
          </div>
        )}

        {/* EMPLOYEES */}
        {tab === 'employees' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-[#D4A843]">Employee Accounts</h3>
              <button onClick={() => { setEditId(null); setForm({ username: '', password: '', name: '', counterNumber: '', role: 'employee', categories: [] }); setShowForm(true); setFormError(''); }}
                className="px-5 py-2.5 rounded-xl btn-crimson text-sm font-medium text-white">+ Add Employee</button>
            </div>
            {showForm && (
              <div className="glass-card p-6 space-y-4">
                <h4 className="font-semibold text-white">{editId ? 'Edit Employee' : 'New Employee'}</h4>
                {formError && <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{formError}</div>}
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full p-3 rounded-lg input-dark" placeholder="Full name" /></div>
                  <div><label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Username</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full p-3 rounded-lg input-dark" placeholder="username" /></div>
                  <div><label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Password {editId && '(blank=keep)'}</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full p-3 rounded-lg input-dark" placeholder="••••••" /></div>
                  <div><label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Counter #</label><input type="number" value={form.counterNumber} onChange={(e) => setForm({ ...form, counterNumber: e.target.value })} className="w-full p-3 rounded-lg input-dark" placeholder="1" /></div>
                  <div><label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Role</label><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full p-3 rounded-lg input-dark"><option value="employee">Employee</option><option value="admin">Admin</option></select></div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Categories (optional)</label>
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map(cat => (
                        <label key={cat} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/5 cursor-pointer">
                          <input type="checkbox" checked={form.categories.includes(cat)} onChange={(e) => {
                            if (e.target.checked) setForm({ ...form, categories: [...form.categories, cat] });
                            else setForm({ ...form, categories: form.categories.filter(c => c !== cat) });
                          }} className="accent-[#9C213F]" />
                          {cat}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={saveEmployee} className="px-6 py-2.5 rounded-xl btn-crimson text-sm font-medium text-white">{editId ? 'Update' : 'Create'}</button>
                  <button onClick={() => setShowForm(false)} className="px-6 py-2.5 rounded-xl btn-glass text-sm">Cancel</button>
                </div>
              </div>
            )}
            <div className="glass-card overflow-hidden">
              <table className="w-full">
                <thead><tr className="border-b border-white/5">
                  <th className="text-left px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Username</th>
                  <th className="text-center px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Counter</th>
                  <th className="text-center px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="text-center px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-4 text-xs text-gray-500 uppercase tracking-wider">Actions</th>
                </tr></thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp._id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-medium">{emp.name}</td>
                      <td className="px-6 py-4 text-gray-400 font-mono text-sm">{emp.username}</td>
                      <td className="px-6 py-4 text-center">{emp.counterNumber}</td>
                      <td className="px-6 py-4 text-center"><span className={`text-xs px-2.5 py-1 rounded-full ${emp.role === 'admin' ? 'bg-[#D4A843]/20 text-[#D4A843]' : 'bg-white/5 text-gray-400'}`}>{emp.role}</span></td>
                      <td className="px-6 py-4 text-center"><span className={`w-2 h-2 rounded-full inline-block ${emp.active ? 'bg-green-400' : 'bg-gray-600'}`} /></td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => { setEditId(emp._id); setForm({ username: emp.username, password: '', name: emp.name, counterNumber: String(emp.counterNumber), role: emp.role, categories: emp.categories || [] }); setShowForm(true); setFormError(''); }}
                          className="text-xs text-gray-400 hover:text-white transition-colors mr-3">Edit</button>
                        <button onClick={() => deleteEmployee(emp._id)} className="text-xs text-red-400/60 hover:text-red-400 transition-colors">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {employees.length === 0 && <div className="text-center text-gray-600 py-12">No employees yet.</div>}
            </div>
          </div>
        )}

        {/* CATEGORIES */}
        {tab === 'categories' && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-[#D4A843]">Ticket Categories</h3>
            <p className="text-sm text-gray-500">Manage service categories that visitors can choose from when taking a ticket.</p>
            <div className="glass-card p-6 space-y-3">
              {categories.map((cat, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  {editCatIdx === i ? (
                    <>
                      <input value={editCatVal} onChange={(e) => setEditCatVal(e.target.value)} className="flex-1 p-2 rounded-lg input-dark text-sm" onKeyDown={(e) => e.key === 'Enter' && updateCategory(i)} />
                      <button onClick={() => updateCategory(i)} className="text-xs text-green-400 hover:text-green-300">Save</button>
                      <button onClick={() => setEditCatIdx(null)} className="text-xs text-gray-500">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium">{cat}</span>
                      <button onClick={() => { setEditCatIdx(i); setEditCatVal(cat); }} className="text-xs text-gray-400 hover:text-white">Edit</button>
                      <button onClick={() => removeCategory(i)} className="text-xs text-red-400/60 hover:text-red-400">Delete</button>
                    </>
                  )}
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCategory()} placeholder="New category..." className="flex-1 p-3 rounded-lg input-dark text-sm" />
                <button onClick={addCategory} disabled={catSaving} className="px-5 py-2.5 rounded-xl btn-crimson text-sm font-medium text-white disabled:opacity-50">
                  {catSaved ? '✓' : '+ Add'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ANALYTICS */}
        {tab === 'analytics' && analytics && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-[#D4A843]">Analytics Dashboard</h3>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Today', value: analytics.today.total, color: 'text-white' },
                { label: 'Avg Wait', value: `${analytics.today.avgWaitTime}m`, color: 'text-[#D4A843]' },
                { label: 'Avg Serve', value: `${analytics.today.avgServeTime}m`, color: 'text-blue-400' },
                { label: 'Cancelled', value: analytics.today.cancelled, color: 'text-red-400' },
              ].map((s) => (
                <div key={s.label} className="glass-card-sm p-5 text-center">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">{s.label}</div>
                  <div className={`text-3xl font-bold mt-2 ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Peak Hours */}
            <div className="glass-card p-6">
              <h4 className="text-sm font-semibold text-[#D4A843] mb-4">Peak Hours (Today)</h4>
              <div className="flex items-end gap-1 h-32">
                {analytics.today.peakHours.map((count, h) => {
                  const max = Math.max(...analytics.today.peakHours, 1);
                  const pct = (count / max) * 100;
                  return (
                    <div key={h} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] text-gray-500">{count || ''}</span>
                      <div className="w-full rounded-t" style={{ height: `${pct}%`, minHeight: count > 0 ? '4px' : '0', background: count > 0 ? 'linear-gradient(to top, #9C213F, #b82a4d)' : 'transparent' }} />
                      <span className="text-[8px] text-gray-600">{h}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Counter Breakdown */}
            <div className="glass-card p-6">
              <h4 className="text-sm font-semibold text-[#D4A843] mb-4">Tickets per Counter</h4>
              <div className="grid grid-cols-4 gap-3">
                {Object.entries(analytics.today.counterBreakdown).map(([num, count]) => (
                  <div key={num} className="glass-card-sm p-4 text-center">
                    <div className="text-xs text-gray-500">Counter {num}</div>
                    <div className="text-2xl font-bold text-white mt-1">{count}</div>
                  </div>
                ))}
              </div>
              {Object.keys(analytics.today.counterBreakdown).length === 0 && <div className="text-gray-600 text-center py-4 text-sm">No data yet</div>}
            </div>

            {/* Weekly Trend */}
            <div className="glass-card p-6">
              <h4 className="text-sm font-semibold text-[#D4A843] mb-4">Last 7 Days</h4>
              <div className="flex items-end gap-2 h-28">
                {analytics.week.map((d) => {
                  const max = Math.max(...analytics.week.map(w => w.total), 1);
                  const pct = (d.total / max) * 100;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] text-gray-500">{d.total}</span>
                      <div className="w-full rounded-t" style={{ height: `${pct}%`, minHeight: d.total > 0 ? '4px' : '0', background: 'linear-gradient(to top, #D4A843, #b8923a)' }} />
                      <span className="text-[8px] text-gray-600">{d.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Employee Performance */}
            <div className="glass-card p-6">
              <h4 className="text-sm font-semibold text-[#D4A843] mb-4">Employee Performance</h4>
              <table className="w-full">
                <thead><tr className="border-b border-white/5">
                  <th className="text-left px-4 py-2 text-xs text-gray-500">Name</th>
                  <th className="text-center px-4 py-2 text-xs text-gray-500">Counter</th>
                  <th className="text-center px-4 py-2 text-xs text-gray-500">Tickets Served</th>
                  <th className="text-center px-4 py-2 text-xs text-gray-500">Avg Serve Time</th>
                </tr></thead>
                <tbody>
                  {analytics.employeeStats.map((e) => (
                    <tr key={e.counterNumber} className="border-b border-white/[0.03]">
                      <td className="px-4 py-3 text-sm">{e.name}</td>
                      <td className="px-4 py-3 text-sm text-center">{e.counterNumber}</td>
                      <td className="px-4 py-3 text-sm text-center font-medium text-[#D4A843]">{e.ticketsServed}</td>
                      <td className="px-4 py-3 text-sm text-center">{e.avgServeTime} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {analytics.employeeStats.length === 0 && <div className="text-gray-600 text-center py-4 text-sm">No data yet</div>}
            </div>
          </div>
        )}

        {/* VOICE */}
        {tab === 'voice' && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-[#D4A843]">Voice Announcement Settings</h3>
            {savedVoice && (
              <div className="glass-card-sm p-4 flex items-center gap-3">
                <span className="text-green-400">✓</span><span className="text-sm text-gray-400">Currently saved:</span><span className="text-sm text-white font-medium">{savedVoice}</span>
              </div>
            )}
            <div className="glass-card p-6 space-y-5">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Select Voice</label>
                <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)} className="w-full p-4 rounded-xl input-dark text-base">
                  <option value="">Auto (best available)</option>
                  {voices.map((v) => <option key={v.name} value={v.name} className="bg-[#1a2328]">{v.name} ({v.lang}) {v.localService ? '' : '☁️'}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Speed: {voiceRate.toFixed(2)}</label>
                  <input type="range" min="0.5" max="1.5" step="0.05" value={voiceRate} onChange={(e) => setVoiceRate(parseFloat(e.target.value))} className="w-full accent-[#9C213F]" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Pitch: {voicePitch.toFixed(2)}</label>
                  <input type="range" min="0.5" max="1.5" step="0.05" value={voicePitch} onChange={(e) => setVoicePitch(parseFloat(e.target.value))} className="w-full accent-[#9C213F]" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Preview Text</label>
                <textarea value={previewText} onChange={(e) => setPreviewText(e.target.value)} rows={3} className="w-full p-4 rounded-xl input-dark text-sm resize-none" />
              </div>
              <div className="flex gap-3">
                <button onClick={previewVoice} className="px-6 py-3 rounded-xl btn-glass text-sm font-medium">🔊 Preview</button>
                <button onClick={() => window.speechSynthesis?.cancel()} className="px-6 py-3 rounded-xl btn-glass text-sm font-medium text-gray-400">⏹ Stop</button>
                <button onClick={saveVoiceSettings} disabled={voiceSaving} className="px-6 py-3 rounded-xl btn-crimson text-sm font-medium text-white disabled:opacity-50">
                  {voiceSaved ? '✓ Saved!' : voiceSaving ? 'Saving...' : '💾 Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIDEOS */}
        {tab === 'videos' && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-[#D4A843]">Display Videos</h3>
            <div className="glass-card p-6">
              <input ref={fileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" onChange={(e) => { const f = e.target.files; if (f?.[0]) uploadVideo(f[0]); e.target.value = ''; }} className="hidden" />
              <div onClick={() => !videoUploading && fileInputRef.current?.click()} className={`border-2 border-dashed border-white/10 rounded-xl p-8 text-center cursor-pointer hover:border-[#9C213F]/40 transition-all ${videoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {videoUploading ? <div><div className="text-3xl mb-2 animate-pulse">⏳</div><div className="text-sm text-gray-400">{uploadProgress}</div></div>
                  : <div><div className="text-3xl mb-2">📁</div><div className="text-sm text-white font-medium">Click to upload video</div><div className="text-xs text-gray-500 mt-1">MP4, WebM, MOV</div></div>}
              </div>
            </div>
            {videoList.length > 0 && (
              <div className="glass-card p-6 space-y-3">
                <h4 className="font-semibold text-white text-sm mb-3">Playlist ({videoList.length})</h4>
                {videoList.map((v, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-xs text-gray-600 font-mono w-6">#{i + 1}</span>
                    <div className="flex-1 min-w-0"><div className="text-sm font-medium text-white truncate">{v.name || v.filename}</div></div>
                    <video src={v.url} className="w-16 h-10 rounded object-cover bg-black/50" muted preload="metadata" />
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveVideo(i, -1)} className="text-gray-500 hover:text-white p-1.5 text-xs">▲</button>
                      <button onClick={() => moveVideo(i, 1)} className="text-gray-500 hover:text-white p-1.5 text-xs">▼</button>
                      <button onClick={() => removeVideo(i)} className="text-red-400/60 hover:text-red-400 p-1.5 text-xs">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-[#D4A843]">System Settings</h3>

            {/* Auto Reset */}
            <div className="glass-card p-6 space-y-4">
              <h4 className="font-semibold text-white text-sm">Auto Daily Reset</h4>
              <p className="text-xs text-gray-500">Automatically reset the queue at a specific time each day.</p>
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500">Reset Time:</label>
                <input type="time" value={autoResetTime} onChange={(e) => setAutoResetTime(e.target.value)} className="p-2 rounded-lg input-dark text-sm" />
              </div>
            </div>

            {/* Custom Ticker Messages */}
            <div className="glass-card p-6 space-y-4">
              <h4 className="font-semibold text-white text-sm">Custom Ticker Messages</h4>
              <p className="text-xs text-gray-500">Add custom messages that scroll on the display monitor ticker.</p>
              {tickerMessages.map((msg, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <span className="flex-1 text-sm">{msg}</span>
                  <button onClick={() => setTickerMessages(tickerMessages.filter((_, j) => j !== i))} className="text-xs text-red-400/60 hover:text-red-400">✕</button>
                </div>
              ))}
              <div className="flex gap-3">
                <input value={newTicker} onChange={(e) => setNewTicker(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newTicker.trim()) { setTickerMessages([...tickerMessages, newTicker.trim()]); setNewTicker(''); } }} placeholder="New message..." className="flex-1 p-3 rounded-lg input-dark text-sm" />
                <button onClick={() => { if (newTicker.trim()) { setTickerMessages([...tickerMessages, newTicker.trim()]); setNewTicker(''); } }} className="px-4 py-2 rounded-lg btn-glass text-sm">+ Add</button>
              </div>
            </div>

            <button onClick={saveSettings} disabled={settingsSaving} className="px-6 py-3 rounded-xl btn-crimson text-sm font-medium text-white disabled:opacity-50">
              {settingsSaved ? '✓ Saved!' : settingsSaving ? 'Saving...' : '💾 Save Settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
