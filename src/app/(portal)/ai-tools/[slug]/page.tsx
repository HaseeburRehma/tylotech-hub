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
import { notFound, useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme/theme-provider";
import { useT } from "@/lib/i18n/provider";
import { useActiveClient } from "@/components/providers/active-client-provider";
import { ClientLogo } from "@/components/layout/sidebar";
import { AiHistoryModal } from "@/components/modals/ai-history-modal";
import { useUser } from "@/components/providers/user-provider";
import { createClient } from "@/lib/supabase/client";
import { lockedToolSlugs } from "@/lib/tool-access";
import { pushAiHistory, readAiHistory } from "@/lib/ai-history";

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

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ClientChip({ fallbackCompany }: { fallbackCompany: string }) {
  const { clients, active, setActive } = useActiveClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const company = active?.name ?? fallbackCompany;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const badge = active ? (
    <ClientLogo client={active} size={24} />
  ) : (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold text-brand">
      {initialsOf(company)}
    </span>
  );

  // Clients only ever generate for their own brand.
  if (clients.length === 0) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground">
        {badge}
        {company}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex max-w-[220px] items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
      >
        {badge}
        <span className="truncate">{company}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-50 mt-1 max-h-72 w-60 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-float"
        >
          {clients.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={c.id === active?.id}
                onClick={() => {
                  setOpen(false);
                  if (c.id !== active?.id) setActive(c);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-2"
              >
                <ClientLogo client={c} size={24} />
                <span className="flex-1 truncate">{c.name}</span>
                {c.id === active?.id && <Check className="h-4 w-4 text-brand" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ToolPage() {
  const { slug } = useParams<{ slug: string }>();
  const { theme } = useTheme();
  const { active } = useActiveClient();
  const t = useT();
  const config = CONFIG[slug];
  if (!config) notFound();

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [isError, setIsError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [generatedFor, setGeneratedFor] = useState<string>("");
  const [showHistory, setShowHistory] = useState(false);
  const [action, setAction] = useState<{ kind: "doc" | "chat"; state: "busy" | "ok" | "error"; msg?: string } | null>(null);
  const user = useUser();
  const searchParams = useSearchParams();
  const historyId = searchParams.get("h");
  const brand = active?.name ?? theme.company;
  const targetClientId = user.role === "client" ? user.client_id : active?.id ?? null;
  const Icon = config.icon;

  // Check up front whether this tool is off (globally or for this client), so a
  // direct link or history entry doesn't let someone fill the form for nothing.
  const [blocked, setBlocked] = useState<"tool_locked" | "tool_disabled" | null>(null);
  useEffect(() => {
    const sb = createClient();
    if (!sb) return;
    let alive = true;
    (async () => {
      const { data } = await sb.from("ai_tools").select("is_active").eq("slug", slug).maybeSingle();
      if (data?.is_active === false) return alive && setBlocked("tool_disabled");
      if (user.role === "client" && (await lockedToolSlugs(sb, user.client_id)).has(slug)) alive && setBlocked("tool_locked");
    })();
    return () => {
      alive = false;
    };
  }, [slug, user.role, user.client_id]);

  // Prefill the first text field from the AI Tools hero prompt (?topic=...).
  const prefill = searchParams.get("topic");
  useEffect(() => {
    if (!prefill) return;
    const first = config.fields.find((f) => f.type !== "select");
    if (first) setInputs((s) => ({ ...s, [first.name]: prefill.slice(0, 2000) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Re-open a past generation from the history panel.
  useEffect(() => {
    if (!historyId) return;
    const entry = readAiHistory(user.id).find((e) => e.id === historyId && e.tool === slug);
    if (!entry) return;
    setInputs(entry.inputs);
    setOutput(entry.output);
    setGeneratedAt(new Date(entry.at));
    setGeneratedFor(entry.brand);
    setDemo(false);
    setAction(null);
  }, [historyId, slug, user.id]);

  async function saveAsDocument() {
    if (!targetClientId || !output) return;
    setAction({ kind: "doc", state: "busy" });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const file = new File([`# ${t(config.name)} — ${generatedFor || brand}\n\n${output}\n`], `${slug}-${stamp}.md`, {
      type: "text/markdown",
    });
    const form = new FormData();
    form.append("file", file);
    form.append("clientId", targetClientId);
    form.append("type", "asset");
    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      setAction(res.ok ? { kind: "doc", state: "ok" } : { kind: "doc", state: "error", msg: data.error });
    } catch {
      setAction({ kind: "doc", state: "error" });
    }
  }

  async function shareInChat() {
    if (!targetClientId || !output) return;
    setAction({ kind: "chat", state: "busy" });
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `✨ ${t(config.name)}\n\n${output}`, clientId: targetClientId }),
      });
      const data = await res.json().catch(() => ({}));
      setAction(res.ok ? { kind: "chat", state: "ok" } : { kind: "chat", state: "error", msg: data.error });
    } catch {
      setAction({ kind: "chat", state: "error" });
    }
  }

  async function run() {
    const missing = config.fields.find((f) => f.type !== "select" && f.required && !(inputs[f.name] ?? "").trim());
    if (missing) {
      setFormError(t("ait.fieldRequired", { field: t(missing.label) }));
      return;
    }
    setFormError(null);
    setLoading(true);
    setOutput("");
    setIsError(false);
    setAction(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: slug, inputs, brand }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.output) {
        setIsError(true);
        // Known cases come back as codes so they show in the user's language.
        setOutput(data.code ? t(`ait.err.${data.code}`) : t("ait.somethingWrong"));
        return;
      }
      setOutput(data.output);
      setDemo(Boolean(data.demo));
      setGeneratedAt(new Date());
      setGeneratedFor(brand);
      pushAiHistory(user.id, { tool: slug, brand, inputs, output: data.output });
    } catch {
      setIsError(true);
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
        <ClientChip fallbackCompany={theme.company} />
      </div>

      <AiHistoryModal open={showHistory} onClose={() => setShowHistory(false)} tool={slug} />

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
            {formError && <p role="alert" className="mb-3 text-sm text-danger">{formError}</p>}
            {blocked && <p role="alert" className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">{t(`ait.err.${blocked}`)}</p>}
            <Button onClick={run} loading={loading} disabled={!!blocked} className="w-full" size="lg">
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
            {output && !isError ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t("ait.copied") : t("ait.copy")}
                </button>
                <button
                  type="button"
                  onClick={saveAsDocument}
                  disabled={!targetClientId || action?.state === "busy"}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
                >
                  {action?.kind === "doc" && action.state === "ok" ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  {t("ait.asDocument")}
                </button>
                <button
                  type="button"
                  onClick={() => void run()}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("ait.regenerate")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowHistory(true)}
                className="text-sm text-muted hover:text-foreground"
              >
                {t("ait.history")}
              </button>
            )}
          </div>

          {demo && output && !isError && (
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
            ) : output && isError ? (
              <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-5 text-sm text-danger">
                <p className="font-medium">{t("ait.failedTitle")}</p>
                <p className="mt-1">{output}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => void run()}>
                  <RefreshCw className="h-3.5 w-3.5" /> {t("ait.tryAgain")}
                </Button>
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
          {output && !loading && !isError && (
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <p className="text-xs text-muted">
                {generatedFor || brand}
                {generatedAt && (
                  <>
                    {" · "}
                    {generatedAt.toLocaleDateString("de-DE", { day: "numeric", month: "numeric" })},{" "}
                    {generatedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={shareInChat}
                disabled={!targetClientId || action?.state === "busy"}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
              >
                {action?.kind === "chat" && action.state === "ok" ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <MessageCircle className="h-3.5 w-3.5" />
                )}
                {t("ait.shareInChat")}
              </button>
            </div>
          )}
          {action && action.state !== "busy" && (
            <p
              role="status"
              className={`mt-2 text-xs ${action.state === "ok" ? "text-success" : "text-danger"}`}
            >
              {action.state === "ok"
                ? action.kind === "doc"
                  ? t("ait.savedToDocs")
                  : t("ait.sharedInChat")
                : action.msg ?? t("ait.actionFailed")}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
