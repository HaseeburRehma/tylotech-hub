"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  FileText,
  LayoutTemplate,
  Lock,
  Mail,
  Megaphone,
  MessageCircle,
  PenLine,
  RefreshCw,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme/theme-provider";
import { useT } from "@/lib/i18n/provider";

type Field =
  | { name: string; label: string; type: "input" | "textarea"; placeholder: string; required?: boolean }
  | { name: string; label: string; type: "select"; options: string[]; hint?: string };

const REGIONS = [
  "Deutschland · NRW",
  "Deutschland · Düsseldorf",
  "Deutschland · Berlin",
  "Deutschland · Bayern",
  "Deutschland · Hamburg",
  "Deutschland · München",
];

const CONFIG: Record<
  string,
  { name: string; icon: typeof PenLine; blurb: string; fields: Field[]; cta: string }
> = {
  "content-generator": {
    name: "ait.cg.name",
    icon: PenLine,
    blurb: "ait.cg.blurb",
    cta: "ait.cg.cta",
    fields: [
      { name: "topic", label: "ait.cg.topic", type: "textarea", placeholder: "ait.cg.topicPh", required: true },
      { name: "platform", label: "ait.cg.platform", type: "select", options: ["Instagram", "LinkedIn", "Facebook", "Blog", "X"], hint: "Instagram · LinkedIn · Facebook · Blog · X" },
      { name: "tone", label: "ait.cg.tone", type: "select", options: ["ait.tone.confident", "ait.tone.professional", "ait.tone.playful", "ait.tone.premium", "ait.tone.direct"], hint: "ait.cg.toneHint" },
    ],
  },
  "ad-copy": {
    name: "ait.ad.name",
    icon: Megaphone,
    blurb: "ait.ad.blurb",
    cta: "ait.ad.cta",
    fields: [
      { name: "product", label: "ait.ad.product", type: "textarea", placeholder: "ait.ad.productPh", required: true },
      { name: "audience", label: "ait.ad.audience", type: "textarea", placeholder: "ait.ad.audiencePh" },
      { name: "goal", label: "ait.ad.goal", type: "select", options: ["ait.goal.leads", "ait.goal.sales", "ait.goal.signups", "ait.goal.awareness"], hint: "ait.ad.goalHint" },
    ],
  },
  "seo-analyzer": {
    name: "ait.seo.name",
    icon: Search,
    blurb: "ait.seo.blurb",
    cta: "ait.seo.cta",
    fields: [
      { name: "target", label: "ait.seo.target", type: "input", placeholder: "https://acme.com", required: true },
      { name: "region", label: "ait.region", type: "select", options: REGIONS, hint: "ait.regionHint" },
    ],
  },
  audience: {
    name: "ait.aud.name",
    icon: Users,
    blurb: "ait.aud.blurb",
    cta: "ait.aud.cta",
    fields: [
      { name: "business", label: "ait.aud.business", type: "textarea", placeholder: "ait.aud.businessPh", required: true },
      { name: "region", label: "ait.region", type: "select", options: REGIONS, hint: "ait.regionHint" },
    ],
  },
  email: {
    name: "ait.email.name",
    icon: Mail,
    blurb: "ait.email.blurb",
    cta: "ait.email.cta",
    fields: [
      { name: "goal", label: "ait.email.goal", type: "textarea", placeholder: "ait.email.goalPh", required: true },
      { name: "audience", label: "ait.email.audience", type: "textarea", placeholder: "ait.email.audiencePh" },
    ],
  },
  "lp-audit": {
    name: "ait.lp.name",
    icon: LayoutTemplate,
    blurb: "ait.lp.blurb",
    cta: "ait.lp.cta",
    fields: [
      { name: "target", label: "ait.lp.target", type: "input", placeholder: "https://acme.com/offer", required: true },
      { name: "goal", label: "ait.lp.goal", type: "select", options: ["ait.goal.leads", "ait.goal.sales", "ait.goal.signups", "ait.goal.bookings"], hint: "ait.lp.goalHint" },
    ],
  },
};

function ClientChip({ company }: { company: string }) {
  const initials = company
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <button className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold text-brand">
        {initials}
      </span>
      {company}
      <ChevronDown className="h-3.5 w-3.5 text-muted" />
    </button>
  );
}

export default function ToolPage() {
  const { slug } = useParams<{ slug: string }>();
  const { theme } = useTheme();
  const t = useT();
  const config = CONFIG[slug];
  if (!config) notFound();

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState(false);
  const [copied, setCopied] = useState(false);
  const Icon = config.icon;

  async function run() {
    setLoading(true);
    setOutput("");
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: slug, inputs, brand: theme.company }),
      });
      const data = await res.json();
      setOutput(data.output ?? data.error ?? t("ait.somethingWrong"));
      setDemo(Boolean(data.demo));
    } catch {
      setOutput(t("ait.networkError"));
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      {/* Back link + client chip row */}
      <div className="flex items-center justify-between">
        <Link href="/ai-tools" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("ait.allTools")}
        </Link>
        <ClientChip company={theme.company} />
      </div>

      {/* Tool header */}
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/15 text-brand">
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t(config.name)}</h1>
          <p className="text-sm text-muted">{t(config.blurb)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Input */}
        <Card className="flex flex-col p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold">{t("ait.input")}</h2>
            <p className="mt-0.5 text-sm text-muted">{t("ait.inputSubtitle")}</p>
          </div>

          <div className="flex-1 space-y-4">
            {config.fields.map((f) => (
              <div key={f.name}>
                <Label htmlFor={f.name}>{t(f.label)}</Label>
                {f.type === "textarea" ? (
                  <Textarea
                    id={f.name}
                    placeholder={t(f.placeholder)}
                    value={inputs[f.name] ?? ""}
                    onChange={(e) => setInputs((s) => ({ ...s, [f.name]: e.target.value }))}
                    rows={3}
                  />
                ) : f.type === "select" ? (
                  <>
                    <select
                      id={f.name}
                      value={inputs[f.name] ?? (f.options[0].startsWith("ait.") ? t(f.options[0]) : f.options[0])}
                      onChange={(e) => setInputs((s) => ({ ...s, [f.name]: e.target.value }))}
                      className="input-base appearance-none"
                    >
                      {f.options.map((o) => {
                        const label = o.startsWith("ait.") ? t(o) : o;
                        return (
                          <option key={o} value={label} className="bg-surface">
                            {label}
                          </option>
                        );
                      })}
                    </select>
                    {f.hint && (
                      <p className="mt-1 text-xs text-muted">{t(f.hint)}</p>
                    )}
                  </>
                ) : (
                  <Input
                    id={f.name}
                    placeholder={t(f.placeholder)}
                    value={inputs[f.name] ?? ""}
                    onChange={(e) => setInputs((s) => ({ ...s, [f.name]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-6">
            <Button onClick={run} loading={loading} className="w-full" size="lg">
              {!loading && <Sparkles className="h-4 w-4" />}
              {t(config.cta)}
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted">
              <Lock className="h-3 w-3" />
              {t("ait.poweredNotice")}
            </p>
          </div>
        </Card>

        {/* Output */}
        <Card className="flex flex-col p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">{t("ait.result")}</h2>
            {output ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={copy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t("ait.copied") : t("ait.copy")}
                </button>
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t("ait.asDocument")}
                </button>
                <button
                  onClick={() => { setOutput(""); setDemo(false); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("ait.regenerate")}
                </button>
              </div>
            ) : (
              <Link href="#" className="text-sm text-muted hover:text-foreground">
                {t("ait.history")}
              </Link>
            )}
          </div>

          {demo && output && (
            <Badge variant="warning" className="mb-3 w-fit">
              {t("ait.demoMode")}
            </Badge>
          )}

          <div className="flex-1">
            {loading ? (
              <div className="space-y-2.5 p-4">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-3 animate-pulse rounded bg-surface-2"
                    style={{ width: `${70 + ((i * 13) % 30)}%` }}
                  />
                ))}
              </div>
            ) : output ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl border border-border bg-bg/40 p-5"
              >
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                  {output}
                </pre>
              </motion.div>
            ) : (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-muted">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
                  <Sparkles className="h-5 w-5 text-muted" />
                </span>
                <p className="text-sm font-semibold text-foreground">{t("ait.noResult")}</p>
                <p className="mx-auto mt-1.5 max-w-[260px] text-xs leading-relaxed text-muted">
                  {t("ait.noResultDesc")}
                </p>
              </div>
            )}
          </div>

          {/* Metadata bar — visible when there's output */}
          {output && !loading && (
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <p className="text-xs text-muted">
                {theme.company} · {new Date().toLocaleDateString("de-DE", { day: "numeric", month: "numeric" })},{" "}
                {new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
              </p>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
                <MessageCircle className="h-3.5 w-3.5" />
                {t("ait.shareInChat")}
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
