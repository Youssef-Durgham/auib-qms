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
  const [tab, setTab] = useState<'dashboard' | 'employees' | 'voice' | 'videos'>('dashboard');

  // Employee form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', password: '', name: '', counterNumber: '', role: 'employee' });
  const [formError, setFormError] = useState('');

  // Voice settings
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [savedVoice, setSavedVoice] = useState('');
  const [voiceRate, setVoiceRate] = useState(0.85);
  const [voicePitch, setVoicePitch] = useState(1.05);
  const [previewText, setPreviewText] = useState('Attention please. Ticket number 42, you are now being served at counter number 3. Please proceed to counter 3. Thank you.');
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceSaved, setVoiceSaved] = useState(false);

  // Video management
  const [videoList, setVideoList] = useState<{ url: string; name: string }[]>([]);
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newVideoName, setNewVideoName] = useState('');
  const [videoSaving, setVideoSaving] = useState(false);
  const [videoSaved, setVideoSaved] = useState(false);

  // Load voices
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) setVoices(v);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Load saved settings (voice + videos)
  const fetchVoiceSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.voiceName) { setSelectedVoice(data.voiceName); setSavedVoice(data.voiceName); }
      if (data.voiceRate) setVoiceRate(parseFloat(data.voiceRate));
      if (data.voicePitch) setVoicePitch(parseFloat(data.voicePitch));
      if (data.videos) {
        try { setVideoList(JSON.parse(data.videos)); } catch { /* ignore */ }
      }
    } catch (e) { console.error(e); }
  }, []);

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
    fetchVoiceSettings();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [token, fetchEmployees, fetchStats, fetchVoiceSettings]);

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

  const previewVoice = () => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(previewText);
    utterance.rate = voiceRate;
    utterance.pitch = voicePitch;
    utterance.volume = 1;
    utterance.lang = 'en-US';
    if (selectedVoice) {
      const v = voices.find((voice) => voice.name === selectedVoice);
      if (v) utterance.voice = v;
    }
    window.speechSynthesis.speak(utterance);
  };

  const stopPreview = () => {
    window.speechSynthesis?.cancel();
  };

  const saveVoiceSettings = async () => {
    setVoiceSaving(true);
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      await Promise.all([
        fetch('/api/settings', { method: 'POST', headers, body: JSON.stringify({ key: 'voiceName', value: selectedVoice }) }),
        fetch('/api/settings', { method: 'POST', headers, body: JSON.stringify({ key: 'voiceRate', value: String(voiceRate) }) }),
        fetch('/api/settings', { method: 'POST', headers, body: JSON.stringify({ key: 'voicePitch', value: String(voicePitch) }) }),
      ]);
      setSavedVoice(selectedVoice);
      setVoiceSaved(true);
      setTimeout(() => setVoiceSaved(false), 3000);
    } catch (e) { console.error(e); }
    setVoiceSaving(false);
  };

  const addVideo = () => {
    if (!newVideoUrl.trim()) return;
    setVideoList([...videoList, { url: newVideoUrl.trim(), name: newVideoName.trim() || `Video ${videoList.length + 1}` }]);
    setNewVideoUrl('');
    setNewVideoName('');
  };

  const removeVideo = (index: number) => {
    setVideoList(videoList.filter((_, i) => i !== index));
  };

  const moveVideo = (index: number, dir: -1 | 1) => {
    const newList = [...videoList];
    const target = index + dir;
    if (target < 0 || target >= newList.length) return;
    [newList[index], newList[target]] = [newList[target], newList[index]];
    setVideoList(newList);
  };

  const saveVideos = async () => {
    setVideoSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'videos', value: JSON.stringify(videoList) }),
      });
      setVideoSaved(true);
      setTimeout(() => setVideoSaved(false), 3000);
    } catch (e) { console.error(e); }
    setVideoSaving(false);
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
          {(['dashboard', 'employees', 'voice', 'videos'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                tab === t ? 'bg-[#9C213F] text-white' : 'btn-glass text-gray-400'
              }`}
            >
              {t === 'dashboard' ? '📊 Dashboard' : t === 'employees' ? '👥 Employees' : t === 'voice' ? '🔊 Voice' : '🎬 Videos'}
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

        {tab === 'videos' && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-[#D4A843]">Display Videos</h3>
            <p className="text-sm text-gray-500">Add video URLs to play on the display monitor. Videos play in order and loop automatically.</p>

            {/* Add video form */}
            <div className="glass-card p-6 space-y-4">
              <h4 className="font-semibold text-white text-sm">Add Video</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Video URL</label>
                  <input
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    className="w-full p-3 rounded-lg input-dark text-sm"
                    placeholder="https://example.com/video.mp4"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Name</label>
                  <input
                    value={newVideoName}
                    onChange={(e) => setNewVideoName(e.target.value)}
                    className="w-full p-3 rounded-lg input-dark text-sm"
                    placeholder="AUIB Promo"
                  />
                </div>
              </div>
              <button
                onClick={addVideo}
                disabled={!newVideoUrl.trim()}
                className="px-5 py-2.5 rounded-xl btn-crimson text-sm font-medium text-white disabled:opacity-50"
              >
                + Add Video
              </button>
            </div>

            {/* Video list */}
            {videoList.length > 0 && (
              <div className="glass-card p-6 space-y-3">
                <h4 className="font-semibold text-white text-sm mb-3">Playlist ({videoList.length} video{videoList.length > 1 ? 's' : ''})</h4>
                {videoList.map((v, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-xs text-gray-600 font-mono w-6">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{v.name}</div>
                      <div className="text-xs text-gray-500 truncate">{v.url}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveVideo(i, -1)} className="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors text-xs" title="Move up">▲</button>
                      <button onClick={() => moveVideo(i, 1)} className="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors text-xs" title="Move down">▼</button>
                      <button onClick={() => removeVideo(i)} className="text-red-400/60 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-xs" title="Remove">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Save */}
            <button
              onClick={saveVideos}
              disabled={videoSaving}
              className="px-6 py-3 rounded-xl btn-crimson text-sm font-medium text-white disabled:opacity-50"
            >
              {videoSaved ? '✓ Saved!' : videoSaving ? 'Saving...' : '💾 Save Video Playlist'}
            </button>

            {/* Help */}
            <div className="glass-card-sm p-4 text-xs text-gray-500 space-y-1">
              <p>💡 <strong className="text-gray-400">Tip:</strong> Use direct video file URLs (.mp4, .webm). Upload videos to a hosting service or your own server.</p>
              <p>Videos play muted on the display monitor and loop automatically through the playlist.</p>
            </div>
          </div>
        )}

        {tab === 'voice' && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-[#D4A843]">Voice Announcement Settings</h3>

            {/* Current saved voice */}
            {savedVoice && (
              <div className="glass-card-sm p-4 flex items-center gap-3">
                <span className="text-green-400">✓</span>
                <span className="text-sm text-gray-400">Currently saved:</span>
                <span className="text-sm text-white font-medium">{savedVoice}</span>
              </div>
            )}

            {/* Voice selector */}
            <div className="glass-card p-6 space-y-5">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Select Voice</label>
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="w-full p-4 rounded-xl input-dark text-base"
                >
                  <option value="">Auto (best available)</option>
                  {voices.map((v) => (
                    <option key={v.name} value={v.name} className="bg-[#1a2328]">
                      {v.name} ({v.lang}) {v.localService ? '' : '☁️'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-600 mt-2">☁️ = Cloud voice (may sound better but needs internet)</p>
              </div>

              {/* Rate & Pitch */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                    Speed: {voiceRate.toFixed(2)}
                  </label>
                  <input
                    type="range" min="0.5" max="1.5" step="0.05"
                    value={voiceRate}
                    onChange={(e) => setVoiceRate(parseFloat(e.target.value))}
                    className="w-full accent-[#9C213F]"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>Slow</span><span>Normal</span><span>Fast</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                    Pitch: {voicePitch.toFixed(2)}
                  </label>
                  <input
                    type="range" min="0.5" max="1.5" step="0.05"
                    value={voicePitch}
                    onChange={(e) => setVoicePitch(parseFloat(e.target.value))}
                    className="w-full accent-[#9C213F]"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>Deep</span><span>Normal</span><span>High</span>
                  </div>
                </div>
              </div>

              {/* Preview text */}
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Preview Text</label>
                <textarea
                  value={previewText}
                  onChange={(e) => setPreviewText(e.target.value)}
                  rows={3}
                  className="w-full p-4 rounded-xl input-dark text-sm resize-none"
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={previewVoice}
                  className="px-6 py-3 rounded-xl btn-glass text-sm font-medium flex items-center gap-2"
                >
                  🔊 Preview Voice
                </button>
                <button
                  onClick={stopPreview}
                  className="px-6 py-3 rounded-xl btn-glass text-sm font-medium text-gray-400"
                >
                  ⏹ Stop
                </button>
                <button
                  onClick={saveVoiceSettings}
                  disabled={voiceSaving}
                  className="px-6 py-3 rounded-xl btn-crimson text-sm font-medium text-white disabled:opacity-50 flex items-center gap-2"
                >
                  {voiceSaved ? '✓ Saved!' : voiceSaving ? 'Saving...' : '💾 Save Settings'}
                </button>
              </div>
            </div>

            {/* Available voices list */}
            <div className="glass-card p-6">
              <h4 className="text-sm font-semibold text-[#D4A843] mb-4">All Available Voices ({voices.length})</h4>
              <div className="max-h-80 overflow-y-auto space-y-1">
                {voices.map((v) => (
                  <div
                    key={v.name}
                    onClick={() => setSelectedVoice(v.name)}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer transition-all ${
                      selectedVoice === v.name
                        ? 'bg-[#9C213F]/20 border border-[#9C213F]/30'
                        : 'hover:bg-white/[0.03] border border-transparent'
                    }`}
                  >
                    <div>
                      <span className="text-sm font-medium">{v.name}</span>
                      <span className="text-xs text-gray-500 ml-2">{v.lang}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!v.localService && <span className="text-xs text-gray-600">☁️</span>}
                      {selectedVoice === v.name && <span className="text-[#9C213F]">●</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
