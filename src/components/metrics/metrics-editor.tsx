"use client";

import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import type { Kpi } from "@/types";

type Row = {
  metric_name: string;
  label: string;
  value: string;
  unit: Kpi["unit"];
  delta: string;
  source: string;
};

const UNITS: Kpi["unit"][] = ["currency", "number", "percent", "ratio", "rank"];
const SOURCES = ["Manual", "Meta Ads", "Google Ads", "Search Console", "GA4"];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "metric";

const DEFAULTS: Row[] = [
  { metric_name: "ad_spend", label: "Monthly Ad Spend", value: "", unit: "currency", delta: "0", source: "Meta Ads" },
  { metric_name: "leads", label: "Leads Generated", value: "", unit: "number", delta: "0", source: "Meta Ads" },
  { metric_name: "cpl", label: "Cost Per Lead", value: "", unit: "currency", delta: "0", source: "Google Ads" },
  { metric_name: "roas", label: "ROAS", value: "", unit: "ratio", delta: "0", source: "Meta Ads" },
];

export function MetricsEditor({ clientId, initialKpis }: { clientId: string; initialKpis: Kpi[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(
    initialKpis.length
      ? initialKpis.map((k) => ({
          metric_name: k.metric_name,
          label: k.label,
          value: String(k.value),
          unit: k.unit,
          delta: String(k.delta),
          source: k.source,
        }))
      : DEFAULTS,
  );
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const set = (i: number, k: keyof Row, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));

  async function save() {
    setState("saving");
    setError(null);
    const kpis = rows
      .filter((r) => r.label.trim())
      .map((r) => ({ ...r, metric_name: r.metric_name || slug(r.label), value: Number(r.value) || 0, delta: Number(r.delta) || 0 }));
    const res = await fetch("/api/kpis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, kpis }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setError(d.error ?? "Could not save.");
      setState("error");
      return;
    }
    setState("saved");
    router.refresh();
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Dashboard KPIs</h3>
          <p className="text-xs text-muted">
            These populate the client&apos;s dashboard live. Connect Meta / Search Console below to
            auto-fill them, or enter values manually.
          </p>
        </div>
        {state === "saved" && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <Check className="h-3.5 w-3.5" /> Saved — client updated live
          </span>
        )}
      </div>

      {error && <div className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-border bg-bg/40 p-3 md:grid-cols-[1.4fr_1fr_1fr_0.9fr_1.1fr_auto]">
            <div>
              <Label>Metric</Label>
              <Input value={r.label} onChange={(e) => set(i, "label", e.target.value)} placeholder="Monthly Ad Spend" />
            </div>
            <div>
              <Label>Value</Label>
              <Input type="number" value={r.value} onChange={(e) => set(i, "value", e.target.value)} placeholder="18400" />
            </div>
            <div>
              <Label>Unit</Label>
              <select value={r.unit} onChange={(e) => set(i, "unit", e.target.value)} className="input-base appearance-none">
                {UNITS.map((u) => <option key={u} value={u} className="bg-surface">{u}</option>)}
              </select>
            </div>
            <div>
              <Label>Δ %</Label>
              <Input type="number" value={r.delta} onChange={(e) => set(i, "delta", e.target.value)} placeholder="12.4" />
            </div>
            <div>
              <Label>Source</Label>
              <select value={r.source} onChange={(e) => set(i, "source", e.target.value)} className="input-base appearance-none">
                {SOURCES.map((s) => <option key={s} value={s} className="bg-surface">{s}</option>)}
              </select>
            </div>
            <button
              onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
              className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:text-danger"
              aria-label="Remove metric"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setRows((r) => [...r, { metric_name: "", label: "", value: "", unit: "number", delta: "0", source: "Manual" }])}
        >
          <Plus className="h-4 w-4" /> Add metric
        </Button>
        <Button onClick={save} loading={state === "saving"}>
          {state === "saving" ? "Saving…" : "Save & publish to client"}
        </Button>
      </div>
    </Card>
  );
}
