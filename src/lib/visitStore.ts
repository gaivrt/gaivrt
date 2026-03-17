const STORAGE_KEY = 'gaivrt_visits';

interface VisitData {
  count: number;
  firstVisit: number;
  lastVisit: number;
}

function getVisitData(): VisitData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { count: 0, firstVisit: Date.now(), lastVisit: Date.now() };
}

function saveVisitData(data: VisitData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

/** Record a new visit. Call once on page load. */
export function recordVisit(): VisitData {
  const data = getVisitData();
  data.count++;
  data.lastVisit = Date.now();
  saveVisitData(data);
  return data;
}

/** Get current visit count without incrementing. */
export function getVisitCount(): number {
  return getVisitData().count;
}

/** Check if a feature is unlocked at the current visit count. */
export function isUnlocked(threshold: number): boolean {
  return getVisitData().count >= threshold;
}

/** Check if this is a returning visitor. */
export function isReturning(): boolean {
  return getVisitData().count > 0;
}
