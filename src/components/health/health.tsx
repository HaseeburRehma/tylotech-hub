"use client";

import { Activity, HeartPulse } from "lucide-react";
import type { ClientHealth, HealthLevel, HealthSignal } from "@/lib/health";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const LEVEL_STYLE: Record<HealthLevel, string> = {
  healthy: "bg-success/15 text-success",
  watch: "bg-warning/15 text-warning",
  risk: "bg-danger/15 text-danger",
  unknown: "bg-surface-2 text-muted",
};

const BAR_STYLE = (score: number) => (score >= 75 ? "bg-success" : score >= 50 ? "bg-warning" : "bg-danger");

export function useHealthText() {
  const t = useT();
  return {
    level: (l: HealthLevel) => t(`health.level.${l}`),
    reason: (s: HealthSignal) => t(s.reason, s.params),
    signal: (s: HealthSignal) => t(`health.signal.${s.key}`),
  };
}

/** Compact score pill; the title shows the main reason. */
export function HealthBadge({ health, className }: { health: ClientHealth | undefined; className?: string }) {
  const text = useHealthText();
  const level = health?.level ?? "unknown";
  const title = health?.topIssue ? text.reason(health.topIssue) : text.level(level);
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", LEVEL_STYLE[level], className)}
    >
      <HeartPulse className="h-3 w-3" />
      {health?.score ?? "—"}
    </span>
  );
}

/** Full breakdown for the client detail page. */
export function HealthCard({ health }: { health: ClientHealth | undefined }) {
  const t = useT();
  const text = useHealthText();
  const level = health?.level ?? "unknown";
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <Activity className="h-4 w-4 text-muted" /> {t("health.title")}
        </h3>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", LEVEL_STYLE[level])}>
          {health?.score != null ? `${health.score} · ${text.level(level)}` : text.level(level)}
        </span>
      </div>
      {!health || health.score == null ? (
        <p className="text-sm text-muted">{t("health.notEnough")}</p>
      ) : null}
      <ul className="space-y-3">
        {(health?.signals ?? []).map((s) => (
          <li key={s.key}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-foreground">{text.signal(s)}</span>
              <span className="tabular-nums text-muted">{s.score}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className={cn("h-full rounded-full", BAR_STYLE(s.score))} style={{ width: `${Math.max(4, s.score)}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-muted">{text.reason(s)}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] leading-relaxed text-muted/80">{t("health.explain")}</p>
    </div>
  );
}
