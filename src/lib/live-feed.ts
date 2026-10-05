import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Live activity feed for the marketing website ("Live aus TyloHQ"). Spec: LIVE_FEED.md.
 *
 * Every event traces back to something that really happened in TyloHQ. The public
 * endpoint only ever serialises id, kind, title, detail and occurredAt — never the
 * client id, source or any personal data.
 */

export const LIVE_KINDS = ["query", "visitors", "leads", "ranking", "booking", "review"] as const;
export type LiveKind = (typeof LIVE_KINDS)[number];

export const ACTIVITY_SOURCES = ["manual", "meta_ads", "google_ads", "ga4", "search_console", "form", "booking", "review"] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export const FEED_WINDOW_MS = 24 * 3600_000;
export const FEED_LIMIT = 20;
const FUTURE_TOLERANCE_MS = 60_000;

export type PublicEvent = { id: string; kind: LiveKind; title: string; detail?: string; occurredAt: string };

export type ActivityRow = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  occurred_at: string;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
export const isLiveKind = (k: unknown): k is LiveKind => typeof k === "string" && (LIVE_KINDS as readonly string[]).includes(k);
export const isActivitySource = (s: unknown): s is ActivitySource =>
  typeof s === "string" && (ACTIVITY_SOURCES as readonly string[]).includes(s);

/** German, sentence case: "1 neuer Lead" / "3 neue Leads". */
export function leadsTitle(n: number): string {
  return n === 1 ? "1 neuer Lead" : `${n} neue Leads`;
}

/** "Meta Ads · Fahrschule · Düsseldorf" — channel first, then the client's public label. */
export function joinDetail(...parts: (string | null | undefined)[]): string | undefined {
  const s = parts.map((p) => (p ? clean(p) : "")).filter(Boolean).join(" · ");
  return s ? s.slice(0, 80) : undefined;
}

/**
 * Maps stored rows to the public shape and drops anything the website would reject:
 * unknown kind, empty/over-long title or detail, outside the 24 h window or > 60 s in the future.
 */
export function serializePublicFeed(rows: ActivityRow[], now = Date.now()): PublicEvent[] {
  const out: PublicEvent[] = [];
  for (const r of rows) {
    if (!r?.id || String(r.id).length > 128 || !isLiveKind(r.kind)) continue;
    const title = clean(String(r.title ?? ""));
    if (!title || title.length > 80) continue;
    const detail = r.detail ? clean(String(r.detail)) : "";
    if (detail.length > 80) continue;
    const t = Date.parse(r.occurred_at);
    if (!Number.isFinite(t) || t < now - FEED_WINDOW_MS || t > now + FUTURE_TOLERANCE_MS) continue;
    out.push({ id: String(r.id), kind: r.kind, title, ...(detail ? { detail } : {}), occurredAt: new Date(t).toISOString() });
  }
  return out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, FEED_LIMIT);
}

export type EmitInput = {
  clientId: string;
  kind: LiveKind;
  title: string; // ≤ 80, German
  detail?: string; // ≤ 80; defaults to the client's public_feed_label
  occurredAt: Date; // when it happened
  source: ActivitySource;
  sourceRef: string; // idempotency key, unique per source
  createdBy?: string;
};

/**
 * Records one real event. Idempotent on (source, source_ref): re-running a sync or
 * double-submitting a form never creates a duplicate. Never throws — a feed problem
 * (e.g. migration 0031 not applied yet) must not break the producer.
 */
export async function emitActivity(admin: SupabaseClient, e: EmitInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const title = clean(e.title).slice(0, 80);
    if (!title || !isLiveKind(e.kind) || !isActivitySource(e.source) || !e.sourceRef) return { ok: false, error: "invalid event" };

    let detail = e.detail !== undefined ? clean(e.detail) : undefined;
    if (detail === undefined) {
      const { data } = await admin.from("clients").select("public_feed_label").eq("id", e.clientId).maybeSingle();
      detail = data?.public_feed_label ? clean(data.public_feed_label) : undefined;
    }

    const { error } = await admin.from("activity_events").upsert(
      {
        client_id: e.clientId,
        kind: e.kind,
        title,
        detail: detail ? detail.slice(0, 80) : null,
        occurred_at: e.occurredAt.toISOString(),
        source: e.source,
        source_ref: e.sourceRef.slice(0, 300),
        created_by: e.createdBy ?? null,
      },
      { onConflict: "source,source_ref", ignoreDuplicates: true },
    );
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "emit failed" };
  }
}

/** Channel names shown in the public detail line. */
export const CHANNEL_LABEL: Record<string, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  ga4: "Website",
  search_console: "Google",
};
