const QUOTA_KEY = 'karaoke-quota';
export const DAILY_LIMIT = 10_000;

// Cost per operation (YouTube Data API v3)
export const QUOTA_COST = {
  search: 101,  // search.list (100) + videos.list (1)
  videoFetch: 1, // videos.list for a single ID
} as const;

interface QuotaState {
  date: string; // YYYY-MM-DD Pacific time (YouTube's reset boundary)
  used: number;
}

function todayPacific(): string {
  // YouTube quota resets at midnight Pacific time, including DST.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function getQuota(): QuotaState {
  if (typeof window === 'undefined') return { date: todayPacific(), used: 0 };
  try {
    const raw = localStorage.getItem(QUOTA_KEY);
    if (!raw) return { date: todayPacific(), used: 0 };
    const parsed: QuotaState = JSON.parse(raw);
    if (parsed.date !== todayPacific() || !Number.isFinite(parsed.used) || parsed.used < 0) return { date: todayPacific(), used: 0 };
    return parsed;
  } catch {
    return { date: todayPacific(), used: 0 };
  }
}

export function addQuotaUsage(units: number): QuotaState {
  const state = getQuota();
  const updated: QuotaState = { date: state.date, used: state.used + units };
  try {
    localStorage.setItem(QUOTA_KEY, JSON.stringify(updated));
    // Notify any mounted QuotaDisplay components
    window.dispatchEvent(new Event('quota-updated'));
  } catch {}
  return updated;
}

export function resetQuota(): void {
  try {
    localStorage.setItem(QUOTA_KEY, JSON.stringify({ date: todayPacific(), used: 0 }));
    window.dispatchEvent(new Event('quota-updated'));
  } catch {}
}

export function getQuotaLevel(used: number): 'ok' | 'warn' | 'critical' {
  const pct = used / DAILY_LIMIT;
  if (pct >= 0.9) return 'critical';
  if (pct >= 0.6) return 'warn';
  return 'ok';
}

