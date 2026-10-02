export interface AiHistoryEntry {
  id: string;
  tool: string;
  brand: string;
  inputs: Record<string, string>;
  output: string;
  at: string;
}

const KEY = "tylotech-hub:ai-history";
const MAX = 40;

export function readAiHistory(): AiHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as AiHistoryEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function pushAiHistory(entry: Omit<AiHistoryEntry, "id" | "at">): AiHistoryEntry {
  const full: AiHistoryEntry = { ...entry, id: crypto.randomUUID(), at: new Date().toISOString() };
  try {
    window.localStorage.setItem(KEY, JSON.stringify([full, ...readAiHistory()].slice(0, MAX)));
  } catch {
    // Storage unavailable (private mode / quota) — history is a convenience only.
  }
  return full;
}

export function clearAiHistory() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}
