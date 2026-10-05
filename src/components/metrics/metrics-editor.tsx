"use client";

import { Check, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { formatCurrency } from "@/lib/utils";
import type { Kpi } from "@/types";

type Row = { metric_name: string; label: string; value: string; unit: Kpi["unit"]; delta: string; period: string };

const UNITS: Kpi["unit"][] = ["currency", "number", "percent", "ratio", "rank"];
const MANUAL = "Manual";

const fmt = (k: Kpi) =>
  k.unit === "currency" ? formatCurrency(k.value) : k.unit === "percent" ? `${k.value} %` : k.unit === "ratio" ? `${k.value}x` : String(k.value);

export function MetricsEditor({ clientId, initialKpis }: { clientId: string; initialKpis: Kpi[] }) {
  const router = useRouter();
  const t = useT();
  const synced = initialKpis.filter((k) => k.source !== MANUAL);
  const [rows, setRows] = useState<Row[]>(
    initialKpis
      .filter((k) => k.source === MANUAL)
      .map((k) => ({
        metric_name: k.metric_name,
        label: k.label,
        value: String(k.value),
        unit: k.unit,
        delta: k.delta == null ? "" : String(k.delta),
        period: k.period ?? "",
      })),
  );
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const set = (i: number, k: keyof Row, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));

  async function save() {
    setState("saving");
    setError(null);
    const res = await fetch("/api/kpis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, kpis: rows.filter((r) => r.label.trim()) }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setError(d.error ?? t("kpiEd.saveFailed"));
      setState("error");
      return;
    }
    setState("saved");
    router.refresh();
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t("kpiEd.title")}</h3>
          <p className="text-xs text-muted">{t("kpiEd.subtitle")}</p>
        </div>
        {state === "saved" && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <Check className="h-3.5 w-3.5" /> {t("kpiEd.saved")}
          </span>
        )}
      </div>

      {synced.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted">
            <RefreshCw className="h-3 w-3" /> {t("kpiEd.syncedTitle")}
          </p>
          <div className="flex flex-wrap gap-2">
            {synced.map((k) => (
              <span key={k.id} className="rounded-lg border border-border bg-surface-2/60 px-2.5 py-1.5 text-xs">
                <span className="text-muted">{k.source} · </span>
                <span className="font-medium text-foreground">{k.label}</span>{" "}
                <span className="tabular-nums text-muted">{fmt(k)}</span>
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">{t("kpiEd.syncedHint")}</p>
        </div>
      )}

      {error && <div className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">{t("kpiEd.manualTitle")}</p>
      {rows.length === 0 && <p className="mb-3 text-sm text-muted">{t("kpiEd.empty")}</p>}
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-border bg-bg/40 p-3 md:grid-cols-[1.4fr_1fr_1fr_0.8fr_1fr_auto]">
            <div className="col-span-2 md:col-span-1">
              <Label>{t("kpiEd.metric")}</Label>
              <Input value={r.label} maxLength={80} onChange={(e) => set(i, "label", e.target.value)} placeholder={t("kpiEd.metricPh")} />
            </div>
            <div>
              <Label>{t("kpiEd.value")}</Label>
              <Input type="number" inputMode="decimal" value={r.value} onChange={(e) => set(i, "value", e.target.value)} />
            </div>
            <div>
              <Label>{t("kpiEd.unit")}</Label>
              <select value={r.unit} onChange={(e) => set(i, "unit", e.target.value)} className="input-base appearance-none">
                {UNITS.map((u) => (
                  <option key={u} value={u} className="bg-surface">
                    {t(`kpiEd.unit.${u}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("kpiEd.delta")}</Label>
              <Input type="number" inputMode="decimal" value={r.delta} onChange={(e) => set(i, "delta", e.target.value)} placeholder="—" />
            </div>
            <div>
              <Label>{t("kpiEd.period")}</Label>
              <Input value={r.period} maxLength={40} onChange={(e) => set(i, "period", e.target.value)} placeholder={t("kpiEd.periodPh")} />
            </div>
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
              className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:text-danger"
              aria-label={t("kpiEd.remove")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setRows((r) => [...r, { metric_name: "", label: "", value: "", unit: "number", delta: "", period: "" }])}
        >
          <Plus className="h-4 w-4" /> {t("kpiEd.add")}
        </Button>
        <Button onClick={save} loading={state === "saving"}>
          {t("kpiEd.publish")}
        </Button>
      </div>
    </Card>
  );
}
