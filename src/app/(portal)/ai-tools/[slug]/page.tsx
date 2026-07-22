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

type Field =
  | { name: string; label: string; type: "input" | "textarea"; placeholder: string; required?: boolean }
  | { name: string; label: string; type: "select"; options: string[] };

const CONFIG: Record<
  string,
  { name: string; icon: typeof PenLine; blurb: string; fields: Field[]; cta: string }
> = {
  "content-generator": {
    name: "Content Generator",
    icon: PenLine,
    blurb: "Generate on-brand social posts, captions and blog drafts in seconds.",
    cta: "Generate content",
    fields: [
      { name: "topic", label: "Topic / brief", type: "textarea", placeholder: "e.g. Launch of our summer real-estate listings in Oslo", required: true },
      { name: "platform", label: "Platform", type: "select", options: ["Instagram", "LinkedIn", "Facebook", "Blog", "X / Twitter"] },
      { name: "tone", label: "Tone of voice", type: "select", options: ["Confident & friendly", "Professional", "Playful", "Luxury / premium", "Bold & direct"] },
    ],
  },
  "seo-analyzer": {
    name: "SEO Analyzer",
    icon: Search,
    blurb: "Analyze any URL or keyword and get a prioritized, actionable SEO audit.",
    cta: "Run SEO analysis",
    fields: [
      { name: "target", label: "URL or keyword", type: "input", placeholder: "https://acme.com  or  real estate Oslo", required: true },
      { name: "region", label: "Market / region", type: "input", placeholder: "e.g. Norway" },
    ],
  },
  audience: {
    name: "Audience Insights",
    icon: Users,
    blurb: "Turn a short business description into actionable audience personas.",
    cta: "Generate personas",
    fields: [
      { name: "business", label: "Business / offer", type: "textarea", placeholder: "e.g. Premium real-estate agency selling waterfront apartments in Oslo", required: true },
      { name: "region", label: "Region", type: "input", placeholder: "e.g. Norway" },
    ],
  },
  email: {
    name: "Email Sequencer",
    icon: Mail,
    blurb: "Draft a full nurture sequence from a single prompt.",
    cta: "Generate sequence",
    fields: [
      { name: "goal", label: "Sequence goal", type: "input", placeholder: "e.g. Nurture new leads to book a call", required: true },
      { name: "audience", label: "Audience", type: "input", placeholder: "e.g. New newsletter subscribers" },
    ],
  },
  "lp-audit": {
    name: "Landing Page Auditor",
    icon: LayoutTemplate,
    blurb: "Section-by-section conversion review of any landing page.",
    cta: "Audit page",
    fields: [
      { name: "target", label: "Landing page URL", type: "input", placeholder: "https://acme.com/offer", required: true },
      { name: "goal", label: "Conversion goal", type: "select", options: ["Lead generation", "Sales / purchases", "Sign-ups", "Bookings"] },
    ],
  },
  "ad-copy": {
    name: "Ad Copy Generator",
    icon: Megaphone,
    blurb: "Meta & Google ad variations engineered to convert.",
    cta: "Generate ad copy",
    fields: [
      { name: "product", label: "Product / service", type: "input", placeholder: "e.g. Premium gym membership", required: true },
      { name: "audience", label: "Target audience", type: "input", placeholder: "e.g. Professionals 25–40 in Berlin" },
      { name: "goal", label: "Campaign goal", type: "select", options: ["Lead generation", "Sales / purchases", "Sign-ups", "Brand awareness"] },
    ],
  },
};

export default function ToolPage() {
  const { slug } = useParams<{ slug: string }>();
  const { theme } = useTheme();
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
      setOutput(data.output ?? data.error ?? "Something went wrong.");
      setDemo(Boolean(data.demo));
    } catch {
      setOutput("Network error. Please try again.");
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
        <ArrowLeft className="h-4 w-4" /> All tools
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/15 text-brand">
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{config.name}</h1>
          <p className="text-sm text-muted">{config.blurb}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Input */}
        <Card className="p-6">
          <div className="space-y-4">
            {config.fields.map((f) => (
              <div key={f.name}>
                <Label htmlFor={f.name}>{f.label}</Label>
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
              {config.cta}
            </Button>
          </div>
        </Card>

        {/* Output */}
        <Card className="flex flex-col p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Output</span>
            {output && (
              <button
                onClick={copy}
                className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>

          {demo && output && (
            <Badge variant="warning" className="mb-3 w-fit">
              Demo mode — add ANTHROPIC_API_KEY for live Claude output
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
                <p className="text-sm">Your AI-generated output will appear here.</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
