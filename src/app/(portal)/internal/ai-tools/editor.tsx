"use client";

import { Check, Clock, Loader2, Megaphone, Mail, PenLine, Search, Users, Globe } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { AiToolRow } from "@/lib/data";

const ICON_MAP: Record<string, React.ElementType> = {
  PenLine,
  Megaphone,
  Search,
  Users,
  Mail,
  Globe,
};

const CAT_LABEL: Record<string, string> = {
  Content: "Inhalte",
  Ads: "Anzeigen",
  SEO: "SEO",
  Analytics: "Analyse",
  content: "Inhalte",
  ads: "Anzeigen",
  seo: "SEO",
  analytics: "Analyse",
};

const SLUG_I18N: Record<string, { name: string; blurb: string }> = {
  "ad-copy": { name: "ait.ad.name", blurb: "ait.ad.blurb" },
  "content-generator": { name: "ait.cg.name", blurb: "ait.cg.blurb" },
  "seo-analyzer": { name: "ait.seo.name", blurb: "ait.seo.blurb" },
  audience: { name: "ait.aud.name", blurb: "ait.aud.blurb" },
  email: { name: "ait.email.name", blurb: "ait.email.blurb" },
  "lp-audit": { name: "ait.lp.name", blurb: "ait.lp.blurb" },
};

export function AiToolsEditor({
  tools,
  clientCount,
}: {
  tools: AiToolRow[];
  clientCount: number;
}) {
  const t = useT();
  const [selectedId, setSelectedId] = useState(tools[0]?.id ?? "");
  const selected = tools.find((t) => t.id === selectedId) ?? tools[0];

  if (!tools.length) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("prompts.title")} subtitle={t("prompts.subtitle")} />
        <div className="rounded-xl border border-border bg-surface py-10 text-center text-sm text-muted">
          No AI tools found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("prompts.title")} subtitle={t("prompts.subtitle")}>
        <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm text-muted">
          <Clock className="h-4 w-4" />
          {t("prompts.affectsAll", { n: clientCount })}
        </button>
      </PageHeader>

      <div className="flex gap-6">
        {/* Sidebar – tool list */}
        <div className="w-64 shrink-0 space-y-1">
          {tools.map((tool) => {
            const Icon = ICON_MAP[tool.slug === "ad-copy" ? "Megaphone" : tool.slug === "content-generator" ? "PenLine" : tool.slug === "seo-analyzer" ? "Search" : tool.slug === "audience" ? "Users" : tool.slug === "email" ? "Mail" : "Globe"];
            const cat = CAT_LABEL[tool.category ?? ""] ?? tool.category ?? "";
            const isActive = tool.id === selectedId;
            return (
              <button
                key={tool.id}
                onClick={() => setSelectedId(tool.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                  isActive
                    ? "bg-brand/5 text-foreground"
                    : "text-foreground hover:bg-surface-2/60",
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                  <Icon className="h-4 w-4 text-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {SLUG_I18N[tool.slug] ? t(SLUG_I18N[tool.slug].name) : tool.name}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                    {cat}
                  </p>
                </div>
                <Badge
                  variant={tool.is_active ? "success" : "neutral"}
                  className="shrink-0 text-[10px]"
                >
                  <span
                    className={cn(
                      "mr-1 inline-block h-1.5 w-1.5 rounded-full",
                      tool.is_active ? "bg-success" : "bg-muted",
                    )}
                  />
                  {tool.is_active ? t("prompts.active").toLowerCase() : t("prompts.inactive")}
                </Badge>
              </button>
            );
          })}
        </div>

        {/* Main panel – prompt editor */}
        {selected && <PromptPanel key={selected.id} tool={selected} t={t} />}
      </div>
    </div>
  );
}

function PromptPanel({
  tool,
  t,
}: {
  tool: AiToolRow;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const [prompt, setPrompt] = useState(tool.prompt_template ?? "");
  const [active, setActive] = useState(tool.is_active);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const cat = CAT_LABEL[tool.category ?? ""] ?? tool.category ?? "";

  async function save(nextActive = active) {
    setState("saving");
    setError(null);
    const res = await fetch("/api/ai-tools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: tool.slug,
        prompt_template: prompt,
        is_active: nextActive,
      }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setError(d.error ?? "Could not save.");
      setState("error");
      return;
    }
    setState("saved");
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2">
            <PenLine className="h-4.5 w-4.5 text-muted" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {SLUG_I18N[tool.slug] ? t(SLUG_I18N[tool.slug].name) : tool.name}
            </h2>
            <p className="text-xs text-muted">
              {SLUG_I18N[tool.slug] ? t(SLUG_I18N[tool.slug].blurb) : tool.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">{t("prompts.active")}</span>
          <button
            onClick={() => {
              const next = !active;
              setActive(next);
              save(next);
            }}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
              active ? "bg-brand" : "bg-surface-2",
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                active ? "translate-x-6" : "translate-x-1",
              )}
            />
          </button>
        </div>
      </div>

      {/* Prompt body */}
      <div className="p-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            {t("prompts.systemPrompt")}
          </span>
          <span className="text-xs tabular-nums text-muted">
            {t("prompts.chars", { n: prompt.length.toLocaleString("de-DE") })}
          </span>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full min-h-[400px] resize-none rounded-xl border border-border bg-bg p-4 font-mono text-sm leading-relaxed text-foreground outline-none transition-colors focus:border-brand/40"
          placeholder="Du schreibst Anzeigentexte für TyloTech…"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-6 py-4">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Avatar name="Designer" size={24} />
          <span>
            {t("prompts.lastEdited", {
              name: "Designer",
              date: new Date().toLocaleDateString("de-DE", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {state === "saved" && (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPrompt(tool.prompt_template ?? "")}
          >
            {t("prompts.discard")}
          </Button>
          <Button size="sm" onClick={() => save()} loading={state === "saving"}>
            {state === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("prompts.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
