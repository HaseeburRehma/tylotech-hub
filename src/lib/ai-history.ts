export interface AiHistoryEntry {
  id: string;
  tool: string;
  brand: string;
  inputs: Record<string, string>;
  output: string;
  at: string;
}

const MAX = 40;
// Scoped per user so a shared browser never shows one account's outputs to another.
const keyFor = (userId: string) => `tylotech-hub:ai-history:${userId}`;

export function readAiHistory(userId: string): AiHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    const list = raw ? (JSON.parse(raw) as AiHistoryEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function pushAiHistory(userId: string, entry: Omit<AiHistoryEntry, "id" | "at">): AiHistoryEntry {
  const full: AiHistoryEntry = { ...entry, id: crypto.randomUUID(), at: new Date().toISOString() };
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify([full, ...readAiHistory(userId)].slice(0, MAX)));
    // Drop the pre-scoping shared key so old outputs don't linger for other users.
    window.localStorage.removeItem("tylotech-hub:ai-history");
  } catch {
    // Storage unavailable (private mode / quota) — history is a convenience only.
  }
  return full;
}

export function clearAiHistory(userId: string) {
  try {
    window.localStorage.removeItem(keyFor(userId));
  } catch {}
}
