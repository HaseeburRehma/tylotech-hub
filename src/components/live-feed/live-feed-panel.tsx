"use client";

import { CalendarCheck, Eye, EyeOff, MessageSquare, Radio, Search, Star, TrendingUp, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { LIVE_KINDS, type LiveKind } from "@/lib/live-feed";
import { cn } from "@/lib/utils";

/**
 * Internal Hub · per client: consent for the public live feed, a form to record a
 * real event (with a preview of how the website will show it) and the recent events
 * with a hide switch. Spec: LIVE_FEED.md.
 */

type Event = { id: string; kind: LiveKind; title: string; detail: string | null; occurred_at: string; source: string; hidden: boolean };
type State = { ready: boolean; optIn: boolean; label: string; events: Event[] };

const ICON: Record<LiveKind, typeof Search> = {
  query: MessageSquare,
  visitors: Users,
  leads: TrendingUp,
  ranking: Search,
  booking: CalendarCheck,
  review: Star,
};

const PRESET: Record<LiveKind, string> = {
  query: "Neue Anfrage über Google",
  visitors: "Besucher gerade live",
  leads: "Neue Leads",
  ranking: "Ranking verbessert auf Platz 1",
  booking: "Erstgespräch gebucht",
  review: "Neue 5★-Bewertung",
};

const AGO = [0, 5, 15, 30, 60, 120, 240];

function relative(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  return h < 24 ? `vor ${h} Std.` : `vor ${Math.round(h / 24)} T.`;
}

export function LiveFeedPanel({ clientId }: { clientId: string }) {
  const t = useT();
  const [state, setState] = useState<State | null>(null);
  const [optIn, setOptIn] = useState(false);
  const [label, setLabel] = useState("");
  const [savingConsent, setSavingConsent] = useState(false);
  const [kind, setKind] = useState<LiveKind>("query");
  const [title, setTitle] = useState(PRESET.query);
  const [detail, setDetail] = useState("");
  const [ago, setAgo] = useState(0);
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/activity?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" });
    if (!res.ok) return setState({ ready: false, optIn: false, label: "", events: [] });
    const data: State = await res.json();
    setState(data);
    setOptIn(data.optIn);
    setLabel(data.label);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3500);
  };

  async function saveConsent() {
    setSavingConsent(true);
    const res = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicFeedOptIn: optIn, publicFeedLabel: label }),
    });
    setSavingConsent(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return flash(false, data.error ?? t("lf.error"));
    flash(true, t("lf.saved"));
    load();
  }

  async function record() {
    setPosting(true);
    const res = await fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, kind, title, detail: detail || undefined, occurredAt: new Date(Date.now() - ago * 60_000).toISOString() }),
    });
    setPosting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return flash(false, data.error ?? t("lf.error"));
    flash(true, t("lf.recorded"));
    setDetail("");
    load();
  }

  async function toggleHidden(e: Event) {
    const res = await fetch("/api/activity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: e.id, hidden: !e.hidden }),
    });
    if (res.ok) load();
    else flash(false, t("lf.error"));
  }

  const PreviewIcon = ICON[kind];
  const previewDetail = (detail || label).trim();

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-1 flex items-center gap-2">
        <Radio className="h-4 w-4 text-brand" />
        <h3 className="font-semibold text-foreground">{t("lf.title")}</h3>
      </div>
      <p className="mb-4 text-xs text-muted">{t("lf.sub")}</p>

      {state && !state.ready ? (
        <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-muted">{t("lf.notReady")}</p>
      ) : (
        <div className="space-y-5">
          {/* consent */}
          <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
              <span>
                <span className="block text-sm font-medium text-foreground">{t("lf.optIn")}</span>
                <span className="block text-xs text-muted">{t("lf.optInHint")}</span>
              </span>
            </label>
            <div>
              <label className="mb-1 block text-xs text-muted">{t("lf.label")}</label>
              <Input value={label} maxLength={60} placeholder="Fahrschule · Düsseldorf" onChange={(e) => setLabel(e.target.value)} />
            </div>
            <Button size="sm" variant="secondary" loading={savingConsent} onClick={saveConsent}>
              {t("lf.saveConsent")}
            </Button>
          </div>

          {/* record */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">{t("lf.record")}</p>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="input-base"
                value={kind}
                onChange={(e) => {
                  const k = e.target.value as LiveKind;
                  setKind(k);
                  setTitle(PRESET[k]);
                }}
              >
                {LIVE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`lf.kind.${k}`)}
                  </option>
                ))}
              </select>
              <select className="input-base" value={ago} onChange={(e) => setAgo(Number(e.target.value))}>
                {AGO.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? t("lf.now") : relative(m * 60_000)}
                  </option>
                ))}
              </select>
            </div>
            <Input value={title} maxLength={80} placeholder={t("lf.titlePh")} onChange={(e) => setTitle(e.target.value)} />
            <Input value={detail} maxLength={80} placeholder={label || t("lf.detailPh")} onChange={(e) => setDetail(e.target.value)} />
            <p className="text-[11px] text-muted">{t("lf.privacy")}</p>

            {/* preview: how the website bar will show it */}
            <div className="flex items-center gap-3 rounded-full bg-[#002e3d] py-2 pl-2 pr-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-[#d8b682]">
                <PreviewIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-white">{title || "…"}</span>
                <span className="block truncate text-[11px] text-[#8cc0d1]">
                  {[previewDetail, ago === 0 ? "gerade eben" : relative(ago * 60_000)].filter(Boolean).join(" · ")}
                </span>
              </span>
            </div>
            {!optIn && <p className="text-[11px] text-warning">{t("lf.notPublic")}</p>}
            <Button size="sm" loading={posting} disabled={!title.trim()} onClick={record}>
              {t("lf.recordBtn")}
            </Button>
          </div>

          {/* recent */}
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{t("lf.recent")}</p>
            {!state ? (
              <p className="text-sm text-muted">…</p>
            ) : state.events.length === 0 ? (
              <p className="text-sm text-muted">{t("lf.empty")}</p>
            ) : (
              <ul className="space-y-2">
                {state.events.map((e) => {
                  const I = ICON[e.kind] ?? Radio;
                  const old = Date.now() - new Date(e.occurred_at).getTime() > 24 * 3600_000;
                  return (
                    <li key={e.id} className={cn("flex items-center gap-3 rounded-lg border border-border p-2.5", (e.hidden || old) && "opacity-55")}>
                      <I className="h-4 w-4 shrink-0 text-brand" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{e.title}</p>
                        <p className="truncate text-xs text-muted">
                          {[e.detail, relative(Date.now() - new Date(e.occurred_at).getTime())].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <Badge className="text-[10px]">{e.source}</Badge>
                      <button
                        type="button"
                        onClick={() => toggleHidden(e)}
                        title={e.hidden ? t("lf.show") : t("lf.hide")}
                        className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground"
                      >
                        {e.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {msg && <p className={cn("text-xs", msg.ok ? "text-success" : "text-danger")}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}
