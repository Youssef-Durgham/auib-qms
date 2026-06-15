export function getTodayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

// Stable per-day key in server-local time (YYYY-MM-DD). Used to scope daily
// ticket numbering and to enforce a unique (dateKey, number) constraint.
export function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// A service category as configured in admin. `prefix` is the letter shown in
// front of the per-type number (e.g. "F" → F1, F2). `limit` is the max tickets
// of this type issuable per day (0 = unlimited). `msg` is the optional reason
// shown to visitors once the type is closed for the day.
export interface CategoryConfig {
  name: string;
  // Arabic display name (optional). The English `name` stays the canonical
  // identity used by tickets/counters/analytics; nameAr is display-only.
  nameAr: string;
  prefix: string;
  limit: number;
  // Per-type starting number for the day (e.g. Registration → 1000, Finance →
  // 2000). 0 means "use the global default start".
  start: number;
  msg: string;
}

// Accept both the legacy format (array of plain name strings) and the new
// format (array of objects) so old saved settings keep working.
export function normalizeCategories(raw: unknown): CategoryConfig[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => {
    if (typeof item === 'string') {
      return { name: item, nameAr: '', prefix: '', limit: 0, start: 0, msg: '' };
    }
    const o = (item || {}) as Record<string, unknown>;
    return {
      name: String(o.name ?? ''),
      nameAr: String(o.nameAr ?? ''),
      prefix: String(o.prefix ?? '').toUpperCase().slice(0, 3),
      limit: Math.max(0, Number(o.limit) || 0),
      start: Math.max(0, Number(o.start) || 0),
      msg: String(o.msg ?? ''),
    };
  }).filter((c) => c.name);
}

// The start of the window over which a category's daily limit is counted.
// Normally it's today's midnight, but an admin "reset limit" action stores a
// newer timestamp (per-category or the '*' wildcard for all) so the count
// restarts from that moment. On a new day, today's midnight is always the
// latest, so the reset naturally expires and the limit counts the fresh day.
export function limitWindowStart(
  dayStart: Date,
  resetMap: Record<string, string>,
  category: string,
): Date {
  let ms = dayStart.getTime();
  const forCat = resetMap[category];
  if (forCat) ms = Math.max(ms, new Date(forCat).getTime());
  const forAll = resetMap['*'];
  if (forAll) ms = Math.max(ms, new Date(forAll).getTime());
  return new Date(ms);
}

// The human-facing ticket label. Prefer the per-type prefix + sequence
// (e.g. "F12"); fall back to the global daily number for legacy tickets that
// predate per-type numbering.
export function ticketLabel(t: { prefix?: string | null; typeSeq?: number | null; number: number }) {
  if (t.prefix && t.typeSeq) return `${t.prefix}${t.typeSeq}`;
  return String(t.number);
}
