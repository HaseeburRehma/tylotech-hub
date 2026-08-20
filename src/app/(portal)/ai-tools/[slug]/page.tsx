"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Copy,
  LayoutTemplate,
  Mail,
  Megaphone,
  PenLine,
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
  | { name: string; label: string; type: "select"; options: string[] };

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
      { name: "topic", label: "ait.cg.topic", type: "textarea", placeholder: "e.g. Launch of our summer real-estate listings in Oslo", required: true },
      { name: "platform", label: "ait.cg.platform", type: "select", options: ["Instagram", "LinkedIn", "Facebook", "Blog", "X / Twitter"] },
      { name: "tone", label: "ait.cg.tone", type: "select", options: ["Confident & friendly", "Professional", "Playful", "Luxury / premium", "Bold & direct"] },
    ],
  },
  "seo-analyzer": {
    name: "ait.seo.name",
    icon: Search,
    blurb: "ait.seo.blurb",
    cta: "ait.seo.cta",
    fields: [
      { name: "target", label: "ait.seo.target", type: "input", placeholder: "https://acme.com  or  real estate Oslo", required: true },
      { name: "region", label: "ait.region", type: "input", placeholder: "e.g. Norway" },
    ],
  },
  audience: {
    name: "ait.aud.name",
    icon: Users,
    blurb: "ait.aud.blurb",
    cta: "ait.aud.cta",
    fields: [
      { name: "business", label: "ait.aud.business", type: "textarea", placeholder: "e.g. Premium real-estate agency selling waterfront apartments in Oslo", required: true },
      { name: "region", label: "ait.region", type: "input", placeholder: "e.g. Norway" },
    ],
  },
  email: {
    name: "ait.email.name",
    icon: Mail,
    blurb: "ait.email.blurb",
    cta: "ait.email.cta",
    fields: [
      { name: "goal", label: "ait.email.goal", type: "input", placeholder: "e.g. Nurture new leads to book a call", required: true },
      { name: "audience", label: "ait.email.audience", type: "input", placeholder: "e.g. New newsletter subscribers" },
    ],
  },
  "lp-audit": {
    name: "ait.lp.name",
    icon: LayoutTemplate,
    blurb: "ait.lp.blurb",
    cta: "ait.lp.cta",
    fields: [
      { name: "target", label: "ait.lp.target", type: "input", placeholder: "https://acme.com/offer", required: true },
      { name: "goal", label: "ait.lp.goal", type: "select", options: ["Lead generation", "Sales / purchases", "Sign-ups", "Bookings"] },
    ],
  },
  "ad-copy": {
    name: "ait.ad.name",
    icon: Megaphone,
    blurb: "ait.ad.blurb",
    cta: "ait.ad.cta",
    fields: [
      { name: "product", label: "ait.ad.product", type: "input", placeholder: "e.g. Premium gym membership", required: true },
      { name: "audience", label: "ait.ad.audience", type: "input", placeholder: "e.g. Professionals 25–40 in Berlin" },
      { name: "goal", label: "ait.ad.goal", type: "select", options: ["Lead generation", "Sales / purchases", "Sign-ups", "Brand awareness"] },
    ],
  },
};

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
      <Link href="/ai-tools" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("ait.allTools")}
      </Link>

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
        <Card className="p-6">
          <div className="space-y-4">
            {config.fields.map((f) => (
              <div key={f.name}>
                <Label htmlFor={f.name}>{t(f.label)}</Label>
                {f.type === "textarea" ? (
                  <Textarea
                    id={f.name}
                    placeholder={f.placeholder}
                    value={inputs[f.name] ?? ""}
                    onChange={(e) => setInputs((s) => ({ ...s, [f.name]: e.target.value }))}
                  />
                ) : f.type === "select" ? (
                  <select
                    id={f.name}
                    value={inputs[f.name] ?? f.options[0]}
                    onChange={(e) => setInputs((s) => ({ ...s, [f.name]: e.target.value }))}
                    className="input-base appearance-none"
                  >
                    {f.options.map((o) => (
                      <option key={o} value={o} className="bg-surface">
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={f.name}
                    placeholder={f.placeholder}
                    value={inputs[f.name] ?? ""}
                    onChange={(e) => setInputs((s) => ({ ...s, [f.name]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            <Button onClick={run} loading={loading} className="w-full" size="lg">
              {!loading && <Sparkles className="h-4 w-4" />}
              {t(config.cta)}
            </Button>
          </div>
        </Card>

        {/* Output */}
        <Card className="flex flex-col p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">{t("ait.output")}</span>
            {output && (
              <button
                onClick={copy}
                className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? t("ait.copied") : t("ait.copy")}
              </button>
            )}
          </div>

          {demo && output && (
            <Badge variant="warning" className="mb-3 w-fit">
              {t("ait.demoMode")}
            </Badge>
          )}

          <div className="flex-1 rounded-xl border border-border bg-bg/40 p-4">
            {loading ? (
              <div className="space-y-2.5">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-3 animate-pulse rounded bg-surface-2"
                    style={{ width: `${70 + ((i * 13) % 30)}%` }}
                  />
                ))}
              </div>
            ) : output ? (
              <motion.pre
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground"
              >
                {output}
              </motion.pre>
            ) : (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center text-muted">
                <Sparkles className="mb-2 h-6 w-6 text-brand/50" />
                <p className="text-sm">{t("ait.outputPlaceholder")}</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
