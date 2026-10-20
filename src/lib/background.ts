import { waitUntil } from "@vercel/functions";

/**
 * Run slow side effects (push, email, third-party calls) after the response is
 * sent — the request returns as soon as the durable write is done. On Vercel,
 * waitUntil keeps the function alive until the task settles; elsewhere (local
 * dev, long-lived Node) the promise simply keeps running. Errors are logged,
 * never thrown into the request.
 */
export function inBackground(label: string, task: () => Promise<unknown>) {
  const p = Promise.resolve()
    .then(task)
    .catch((err) => console.error(`[background:${label}]`, err instanceof Error ? err.message : err));
  try {
    waitUntil(p);
  } catch {
    /* no request context (scripts/tests) — the promise still runs */
  }
  return p;
}
