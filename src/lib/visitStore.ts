const STORAGE_KEY = 'gaivrt_visits';

/** How many times this browser has come. The entrance's inline script does the counting. */
export function getVisitCount(): number {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').count ?? 0;
  } catch {
    return 0;
  }
}
