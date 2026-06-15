'use client';

import { useState, useEffect, useCallback } from 'react';
import { ticketLabel } from '@/app/lib/helpers';

interface TicketData {
  ticket: { number: number; createdAt: string; category: string; prefix?: string; typeSeq?: number };
  position: number;
  estimatedWait: number;
}

interface CategoryStatus {
  name: string;
  nameAr: string;
  prefix: string;
  limit: number;
  issued: number;
  remaining: number | null;
  closed: boolean;
  msg: string;
}

type Lang = 'en' | 'ar';

const DEFAULT_CATEGORIES: CategoryStatus[] = [
  { name: 'Registration', nameAr: 'التسجيل', prefix: '', limit: 0, issued: 0, remaining: null, closed: false, msg: '' },
  { name: 'Finance', nameAr: 'المالية', prefix: '', limit: 0, issued: 0, remaining: null, closed: false, msg: '' },
  { name: 'IT Support', nameAr: 'الدعم الفني', prefix: '', limit: 0, issued: 0, remaining: null, closed: false, msg: '' },
  { name: 'General Inquiry', nameAr: 'استفسار عام', prefix: '', limit: 0, issued: 0, remaining: null, closed: false, msg: '' },
];

const STR = {
  en: {
    queueManagement: 'Queue Management',
    chooseLang: 'Please choose your language',
    peopleWaiting: 'People waiting',
    estimated: (m: number) => `~${m} min estimated`,
    selectService: 'Select Service',
    printingFor: (c: string) => `Printing ticket for ${c}...`,
    closedToday: 'Closed today',
    leftToday: (n: number) => `${n} left today`,
    defaultClosed: (n: number) => `This service has reached today's limit of ${n}. Please come back tomorrow.`,
    genericClosed: 'This service is closed for today.',
    yourTicket: 'Your Ticket',
    newTicket: 'New Ticket',
    other: 'English',
    rowDate: 'Date', rowTime: 'Time', rowPosition: 'Position',
    failed: 'Failed to take ticket. Please try again.',
  },
  ar: {
    queueManagement: 'إدارة الطوابير',
    chooseLang: 'الرجاء اختيار اللغة',
    peopleWaiting: 'عدد المنتظرين',
    estimated: (m: number) => `الوقت المتوقع ~${m} دقيقة`,
    selectService: 'اختر الخدمة',
    printingFor: (c: string) => `جاري طباعة تذكرة ${c}...`,
    closedToday: 'مغلق اليوم',
    leftToday: (n: number) => `متبقي ${n} اليوم`,
    defaultClosed: (n: number) => `هذه الخدمة وصلت للحد اليومي (${n}). الرجاء المراجعة غداً.`,
    genericClosed: 'هذه الخدمة مغلقة اليوم.',
    yourTicket: 'تذكرتك',
    newTicket: 'تذكرة جديدة',
    other: 'العربية',
    rowDate: 'التاريخ', rowTime: 'الوقت', rowPosition: 'الترتيب',
    failed: 'تعذّر إصدار التذكرة. حاول مرة أخرى.',
  },
};

export default function TicketPage() {
  const [lang, setLang] = useState<Lang | null>(null);
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [waitingCount, setWaitingCount] = useState(0);
  const [avgServeTime, setAvgServeTime] = useState(5);
  const [showTicket, setShowTicket] = useState(false);
  const [categories, setCategories] = useState<CategoryStatus[]>(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [closedNotice, setClosedNotice] = useState<string | null>(null);
  const [kioskMode, setKioskMode] = useState(false);

  const t = STR[lang || 'en'];
  const rtl = lang === 'ar';
  const catName = (c: CategoryStatus) => (lang === 'ar' ? c.nameAr || c.name : c.name);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets');
      const data = await res.json();
      setWaitingCount(data.waiting?.length || 0);
      if (data.avgServeTime) setAvgServeTime(data.avgServeTime);
      if (Array.isArray(data.categoryStatus) && data.categoryStatus.length > 0) {
        setCategories(data.categoryStatus);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    // Kiosk mode via ?kiosk=1 — only then do we auto-print + auto-reset.
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('kiosk') === '1') setKioskMode(true);
    }
    fetchQueue();

    const eventSource = new EventSource('/api/sse');
    eventSource.addEventListener('ticket-called', () => fetchQueue());
    eventSource.addEventListener('ticket-created', () => fetchQueue());
    eventSource.addEventListener('ticket-completed', () => fetchQueue());
    eventSource.addEventListener('queue-reset', () => {
      setWaitingCount(0);
      setTicketData(null);
      setShowTicket(false);
      setSelectedCategory(null);
      setLang(null);
    });
    return () => eventSource.close();
  }, [fetchQueue]);

  const takeTicket = async (category: string) => {
    if (loading) return;
    setClosedNotice(null);
    setSelectedCategory(category);
    setLoading(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      });
      const data = await res.json();
      // Service reached its daily limit — show the reason (localized) instead.
      if (res.status === 409 || data.closed) {
        const c = categories.find((x) => x.name === category);
        const reason = c?.msg?.trim() ? c.msg : c?.limit ? t.defaultClosed(c.limit) : t.genericClosed;
        setClosedNotice(reason);
        setSelectedCategory(null);
        fetchQueue();
        setLoading(false);
        return;
      }
      setTicketData(data);
      setShowTicket(true);
      fetchQueue();
    } catch (e) {
      console.error(e);
      alert(t.failed);
    }
    setLoading(false);
  };

  // After the ticket flow, return to the language screen so the next visitor
  // starts fresh.
  const resetView = useCallback(() => {
    setShowTicket(false);
    setTicketData(null);
    setSelectedCategory(null);
    setClosedNotice(null);
    setLang(null);
  }, []);

  // Try the local print agent (ESC/POS, instant, no dialog).
  const sendToAgent = useCallback(async (data: TicketData) => {
    const created = new Date(data.ticket.createdAt);
    const payload = {
      number: ticketLabel(data.ticket),
      category: data.ticket.category,
      date: created.toLocaleDateString(),
      time: created.toLocaleTimeString(),
      position: data.position,
      wait: data.estimatedWait,
    };
    try {
      const controller = new AbortController();
      const tm = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('http://localhost:9100/print', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(tm);
      if (res.ok) { console.log('[ticket] printed via agent'); return true; }
      console.warn('[ticket] agent returned status', res.status);
    } catch (e) {
      console.warn('[ticket] agent unreachable, falling back to browser print', e);
    }
    return false;
  }, []);

  // Auto-print + auto-reset on every ticket.
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

  // Ticket-view category in the chosen language.
  const ticketCatName = (() => {
    if (!ticketData) return '';
    const c = categories.find((x) => x.name === ticketData.ticket.category);
    return lang === 'ar' ? c?.nameAr || ticketData.ticket.category : ticketData.ticket.category;
  })();

  // Brand header band, shared across all screens.
  const Brand = () => (
    <div className="relative px-8 pt-9 pb-7 text-center" style={{ background: 'linear-gradient(180deg, #ffffff, #fdfbf8)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/auib-logo-wide.png" alt="AUIB" className="mx-auto w-64 max-w-[72%] h-auto" />
      <div className="mt-4 mx-auto h-1 w-24 rounded-full" style={{ background: 'linear-gradient(90deg, transparent, #9C213F, transparent)' }} />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5 relative overflow-hidden" dir={rtl ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-[#9C213F]/5 rounded-full blur-[130px]" />
      </div>

      {showTicket ? (
        /* ===== TICKET VIEW ===== */
        <div className="relative z-10 w-full max-w-lg animate-slide-up">
          <div id="print-ticket" className="glass-card overflow-hidden">
            <Brand />
            <div className="px-10 pb-10 text-center">
              <div className="text-sm font-semibold tracking-[0.25em] uppercase text-[#9C213F] mb-4">{t.yourTicket}</div>
              {(() => {
                const lbl = ticketData ? ticketLabel(ticketData.ticket) : '';
                const fs = lbl.length >= 6 ? '4rem' : lbl.length >= 5 ? '5rem' : lbl.length >= 4 ? '6rem' : '7rem';
                return (
                  <div
                    className="mx-auto mb-6 flex items-center justify-center rounded-3xl px-8 py-6 max-w-full overflow-hidden"
                    style={{ background: 'linear-gradient(135deg, #9C213F, #b82a4d)', boxShadow: '0 16px 36px -10px rgba(156,33,63,0.5)' }}
                  >
                    <span className="text-9xl font-black text-white tabular-nums tracking-tight leading-none" style={{ fontSize: fs }}>
                      {lbl}
                    </span>
                  </div>
                );
              })()}

              {ticketCatName && (
                <div className="mb-6 inline-block px-5 py-2 rounded-full bg-[#9C213F]/10 border border-[#9C213F]/25 text-[#9C213F] text-base font-bold">
                  {ticketCatName}
                </div>
              )}

              <div className="w-full h-px bg-gradient-to-r from-transparent via-[#9C213F]/20 to-transparent mb-6" />

              <div className="space-y-3 text-base">
                {[
                  [t.rowDate, new Date(ticketData?.ticket.createdAt || '').toLocaleDateString()],
                  [t.rowTime, new Date(ticketData?.ticket.createdAt || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })],
                  [t.rowPosition, `#${ticketData?.position}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-bold text-gray-800">{value}</span>
                  </div>
                ))}
              </div>

              <button onClick={resetView} className="mt-8 w-full py-5 rounded-2xl btn-crimson text-xl font-bold text-white">
                {t.newTicket}
              </button>
            </div>
          </div>
        </div>
      ) : !lang ? (
        /* ===== LANGUAGE SELECTION ===== */
        <div className="relative z-10 w-full max-w-lg animate-slide-up">
          <div className="glass-card overflow-hidden">
            <Brand />
            <div className="px-10 pb-11">
              <div className="text-center mb-8">
                <div className="text-2xl font-extrabold text-gray-800">Please choose your language</div>
                <div className="text-base text-gray-500 mt-1" dir="rtl">الرجاء اختيار اللغة</div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={() => setLang('en')}
                  className="flex items-center justify-center py-7 rounded-2xl btn-crimson text-3xl font-extrabold text-white"
                >
                  English
                </button>
                <button
                  onClick={() => setLang('ar')}
                  dir="rtl"
                  className="flex items-center justify-center py-7 rounded-2xl text-3xl font-extrabold transition-all"
                  style={{ background: '#fbf7f2', border: '2px solid rgba(156,33,63,0.3)', color: '#273237' }}
                >
                  العربية
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ===== CATEGORY SELECTION ===== */
        <div className="relative z-10 w-full max-w-lg animate-slide-up">
          <div className="glass-card overflow-hidden">
            <Brand />
            <div className="px-8 pb-9">
              {/* Top row: waiting badge + language toggle */}
              <div className="flex items-center justify-between mb-7">
                <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl" style={{ background: 'rgba(156,33,63,0.07)', border: '1px solid rgba(156,33,63,0.15)' }}>
                  <div className="text-2xl font-black text-[#9C213F] leading-none">{waitingCount}</div>
                  <div className="text-xs text-gray-500 leading-tight max-w-[6rem]">{t.peopleWaiting}</div>
                </div>
                <button onClick={() => setLang(null)} className="text-sm font-semibold text-gray-600 hover:text-[#9C213F] transition-colors px-4 py-2 rounded-xl btn-glass">
                  {t.other}
                </button>
              </div>

              <div className="text-center mb-5">
                <div className="text-lg font-bold text-gray-800">
                  {loading && selectedCategory ? (
                    <span className="animate-breathe text-[#9C213F]">{t.printingFor(catName(categories.find((c) => c.name === selectedCategory) || { name: selectedCategory } as CategoryStatus))}</span>
                  ) : (
                    t.selectService
                  )}
                </div>
                <div className="text-sm text-gray-400 mt-0.5">{t.estimated(estimatedMin)}</div>
              </div>

              {closedNotice && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 text-sm text-center font-medium">
                  {closedNotice}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {categories.map((cat) => {
                  const badge = cat.prefix || catName(cat).charAt(0).toUpperCase();
                  return (
                    <button
                      key={cat.name}
                      onClick={() => takeTicket(cat.name)}
                      disabled={loading || cat.closed}
                      className="group relative flex flex-col items-center justify-center gap-3 py-7 px-3 rounded-2xl bg-white transition-all disabled:cursor-not-allowed hover:-translate-y-0.5"
                      style={{
                        border: '2px solid rgba(156,33,63,0.15)',
                        boxShadow: '0 6px 18px -10px rgba(39,50,55,0.25)',
                        ...(cat.closed ? { opacity: 0.5, filter: 'grayscale(0.7)' } : {}),
                      }}
                    >
                      <div
                        className="flex items-center justify-center w-14 h-14 rounded-2xl text-white text-2xl font-black"
                        style={{ background: 'linear-gradient(135deg, #9C213F, #b82a4d)', boxShadow: '0 8px 18px -6px rgba(156,33,63,0.5)' }}
                      >
                        {badge}
                      </div>
                      <div className="text-lg font-bold text-gray-800 leading-tight text-center">{catName(cat)}</div>
                      {cat.closed ? (
                        <span className="text-[11px] font-bold text-red-500 uppercase tracking-wider">{t.closedToday}</span>
                      ) : cat.remaining !== null ? (
                        <span className="text-[11px] text-gray-500">{t.leftToday(cat.remaining)}</span>
                      ) : (
                        <span className="text-[11px] text-transparent select-none">.</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
