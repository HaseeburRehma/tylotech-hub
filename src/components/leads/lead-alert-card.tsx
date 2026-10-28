"use client";

import { Phone, PhoneCall, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import type { Lead } from "@/lib/leads-shared";
import { playLeadSound } from "@/lib/lead-sound";
import { OUTCOMES, countdownState, formatCountdown, remainingSeconds } from "@/lib/speed-to-lead";
import { cn } from "@/lib/utils";

/** Seconds left when an untaken lead rings a second time. */
const REMIND_AT = 30;

const STATE_RING: Record<string, string> = {
  green: "ring-success/60",
  amber: "ring-warning/70",
  red: "ring-danger/70",
  overdue: "ring-danger",
};
const STATE_TEXT: Record<string, string> = {
  green: "text-success",
  amber: "text-warning",
  red: "text-danger",
  overdue: "text-danger",
};

/** First answer whose label looks like a city / postal field. */
function cityOf(lead: Lead): string | null {
  const hit = lead.fields.find((f) => /stadt|ort|city|plz|postal|zip/i.test(f.label));
  return hit?.value?.trim() || null;
}
/** A couple of answers worth showing on the card (not the contact basics). */
function keyAnswers(lead: Lead): { label: string; value: string }[] {
  return lead.fields.filter((f) => !/name|mail|e-?mail|telefon|phone|stadt|ort|city|plz|postal|zip/i.test(f.label) && f.value?.trim()).slice(0, 3);
}

export function LeadAlertCard({
  lead,
  tenantName,
  serverOffsetMs,
  onClose,
}: {
  lead: Lead;
  /** Tenant label, shown to staff who serve several partners. */
  tenantName?: string | null;
  /** Add to Date.now() to get server time (corrects a wrong device clock). */
  serverOffsetMs: number;
  onClose: () => void;
}) {
  const t = useT();
  const createdMs = new Date(lead.created_at).getTime();
  const [remaining, setRemaining] = useState(() => remainingSeconds(createdMs, Date.now() + serverOffsetMs));
  const [claimed, setClaimed] = useState<boolean>(!!lead.claimed_at);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rang = useRef(false);
  // One reminder at 30 s left, unless it arrived with less than that already.
  const reminded = useRef(remaining <= REMIND_AT);

  useEffect(() => {
    if (!rang.current && !claimed) {
      rang.current = true;
      void playLeadSound();
    }
  }, [claimed]);

  useEffect(() => {
    if (claimed || reminded.current || remaining > REMIND_AT || remaining <= 0) return;
    reminded.current = true;
    void playLeadSound();
  }, [claimed, remaining]);

  useEffect(() => {
    const tick = () => setRemaining(remainingSeconds(createdMs, Date.now() + serverOffsetMs));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [createdMs, serverOffsetMs]);

  const state = countdownState(remaining);

  async function claim(call: boolean) {
    setBusy(call ? "call" : "take");
    setError(null);
    const res = await fetch(`/api/leads/${lead.id}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setBusy(null);
    if (res?.ok) {
      setClaimed(true);
      if (call && lead.phone) window.location.href = `tel:${lead.phone.replace(/[^+\d]/g, "")}`;
      return;
    }
    if (res?.status === 409) {
      if (data?.mine) return setClaimed(true);
      setError(data?.claimedByName ? t("s2l.takenBy", { name: data.claimedByName }) : t("s2l.taken"));
      setTimeout(onClose, 1800);
      return;
    }
    setError(data?.error ?? t("s2l.claimError"));
  }

  async function outcome(status: string, key: string) {
    setBusy(key);
    setError(null);
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setBusy(null);
    if (res?.ok) return onClose();
    setError(t("s2l.outcomeError"));
  }

  const city = cityOf(lead);
  const answers = keyAnswers(lead);
  const name = lead.name?.trim() || t("s2l.newLead");

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#08222C]/60 p-4 backdrop-blur-sm">
      <div className={cn("w-full max-w-md overflow-hidden rounded-[22px] border border-line bg-surface shadow-float ring-4", STATE_RING[state])}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div>
            <p className="eyebrow flex items-center gap-2 text-brand-ink">
              {t("s2l.incoming")}
              {lead.is_test && <span className="rounded bg-warning/15 px-1.5 py-0.5 font-semibold text-warning">TEST</span>}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">{name}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {[city, tenantName, lead.phone].filter(Boolean).join(" · ") || t("s2l.noPhone")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Countdown */}
        <div className="px-6 py-4 text-center">
          <div className={cn("font-mono text-6xl font-semibold tabular-nums", STATE_TEXT[state])}>{formatCountdown(remaining)}</div>
          <p className={cn("mt-1 text-xs font-medium uppercase tracking-wider", STATE_TEXT[state])}>
            {state === "overdue" ? t("s2l.overdue") : t("s2l.toCall")}
          </p>
        </div>

        {answers.length > 0 && (
          <div className="mx-6 mb-4 space-y-1.5 rounded-xl bg-bg px-3.5 py-3">
            {answers.map((a) => (
              <div key={a.label} className="flex justify-between gap-3 text-sm">
                <span className="text-muted">{a.label}</span>
                <span className="truncate font-medium text-foreground">{a.value}</span>
              </div>
            ))}
          </div>
        )}

        {error && <div className="mx-6 mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        {/* Actions */}
        <div className="border-t border-line bg-bg px-6 py-4">
          {!claimed ? (
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" loading={busy === "take"} disabled={!!busy} onClick={() => claim(false)}>
                {t("s2l.take")}
              </Button>
              <Button className="flex-1" loading={busy === "call"} disabled={!!busy} onClick={() => claim(true)}>
                <PhoneCall className="h-4 w-4" />
                {t("s2l.callNow")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {lead.phone && (
                <a
                  href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand bg-gradient-to-b from-white/20 to-black/10 font-display text-sm font-semibold text-brand-foreground shadow-card hover:brightness-105"
                >
                  <Phone className="h-4 w-4" />
                  {t("s2l.call")} {lead.phone}
                </a>
              )}
              <div>
                <p className="mb-1.5 text-center text-xs text-muted">{t("s2l.afterCall")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {OUTCOMES.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      disabled={!!busy}
                      onClick={() => outcome(o.status, o.key)}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-50",
                        o.tone === "positive" && "border-success/30 text-success hover:bg-success/10",
                        o.tone === "neutral" && "border-border text-foreground hover:bg-surface-2",
                        o.tone === "danger" && "border-danger/30 text-danger hover:bg-danger/10",
                        o.key === "appointment" && "col-span-2",
                      )}
                    >
                      {t(`s2l.outcome.${o.key}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
