"use client";

import { AiHistoryModal } from "@/components/modals/ai-history-modal";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Clock,
  FileText,
  LayoutTemplate,
  Lock,
  Mail,
  Megaphone,
  PenLine,
  Search,
  Send,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { RequestToolModal } from "@/components/modals/request-tool-modal";
import { useT } from "@/lib/i18n/provider";
import { useUser } from "@/components/providers/user-provider";
import { AI_TOOLS } from "@/lib/ai-tools";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { readAiHistory, type AiHistoryEntry } from "@/lib/ai-history";
import { lockedToolSlugs } from "@/lib/tool-access";
import { APP_TZ } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  PenLine,
  Megaphone,
  Search,
  Users,
  Mail,
  LayoutTemplate,
};

export default function AiToolsPage() {
  const t = useT();
  const user = useUser();
  const router = useRouter();
  // Staff can switch a tool off globally (ai_tools.is_active) or per client
  // (client_tools); the generate API enforces both.
  const [inactive, setInactive] = useState<Set<string>>(new Set());
  // Locked for this client's plan (client_tools) → shown as an upsell, not "off".
  const [planLocked, setPlanLocked] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<AiHistoryEntry[]>([]);
  useEffect(() => {
    setRecent(readAiHistory(user.id).slice(0, 3));
    const sb = createClient();
    if (!sb) return;
    Promise.all([
      sb.from("ai_tools").select("slug,is_active"),
      user.role === "client" ? lockedToolSlugs(sb, user.client_id) : Promise.resolve(new Set<string>()),
    ]).then(([{ data }, locked]) => {
      const off = new Set(locked);
      const globallyOff = new Set<string>();
      for (const r of data ?? []) if (r.is_active === false) { off.add(r.slug); globallyOff.add(r.slug); }
      setInactive(off);
      setPlanLocked(new Set(Array.from(locked).filter((slug) => !globallyOff.has(slug))));
    });
  }, [user.id, user.role, user.client_id]);
  const unlocked = AI_TOOLS.filter((tool) => !inactive.has(tool.slug)).length;
  const sendHero = () => {
    const text = prompt.trim();
    if (!text) return;
    router.push(`/ai-tools/content-generator?topic=${encodeURIComponent(text.slice(0, 2000))}`);
  };
  const [prompt, setPrompt] = useState("");
  const [showRequestTool, setShowRequestTool] = useState(false);
  const [requestPrefill, setRequestPrefill] = useState<string | undefined>(undefined);
  const [showHistory, setShowHistory] = useState(false);
  const firstName = user.name?.split(" ")[0] ?? "";

  return (
    <div className="space-y-8 pb-6">
      <PageHeader title={t("ai.title")} subtitle={t("ai.subtitle")}>
        <div className="flex items-center gap-2">
          {user.role !== "client" && (
            <Link href="/internal/ai-tools">
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4" />
                {t("ait.brandRules")}
              </Button>
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
            <Clock className="h-4 w-4" />
            {t("ait.history")}
          </Button>
        </div>
      </PageHeader>
      <AiHistoryModal open={showHistory} onClose={() => setShowHistory(false)} />

      {/* Hero prompt */}
      <div className="text-center">
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="font-display text-[28px] font-semibold tracking-[-0.03em] md:text-[34px]"
        >
          {(() => {
            const parts = t("ait.heroTitle").split("{start}");
            return (
              <>
                {parts[0]}
                <em className="font-serif text-[1.08em] font-normal italic tracking-normal text-brand-ink">{t("ait.heroStart")}</em>
                {firstName ? `, ${firstName}` : ""}
                {parts[1]}
              </>
            );
          })()}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="mx-auto mt-2 max-w-lg text-sm text-soft"
        >
          {t("ait.heroSubtitle")}
        </motion.p>
      </div>

      {/* Chat input */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="mx-auto max-w-3xl"
      >
        {/* Figma: deep teal prompt card */}
        <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-[#17485b] to-[#04161d] shadow-float ring-1 ring-black/10">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendHero();
              }
            }}
            aria-label={t("ait.heroSubtitle")}
            placeholder={t("ait.heroSubtitle")}
            rows={3}
            className="block w-full resize-none bg-transparent px-5 pt-4 text-[15px] text-white placeholder:text-white/45 focus:outline-none"
          />
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white/80">
                {user.company ?? user.name?.split(" ")[0] ?? "Client"}
              </span>
            </div>
            <button
              type="button"
              onClick={sendHero}
              aria-label={t("ait.heroSend")}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              disabled={!prompt.trim()}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Tools grid */}
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h3 className="font-mono text-[11px] text-muted">{t("ait.readyTools")}</h3>
            <span className="rounded bg-positive/10 px-1.5 py-px font-mono text-[10px] text-positive">
              {t("ait.toolsAvailable", { n: unlocked, total: AI_TOOLS.length })}
            </span>
          </div>
          <button onClick={() => { setRequestPrefill(undefined); setShowRequestTool(true); }} className="text-[13px] text-soft transition-colors hover:text-foreground">
            {t("ait.requestOwnTool")}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AI_TOOLS.map((tool, i) => {
            const Icon = ICONS[tool.icon] ?? Bot;
            const off = inactive.has(tool.slug);
            const upgrade = planLocked.has(tool.slug);
            return (
              <motion.div
                key={tool.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.04 }}
              >
                <Link
                  href={off ? "#" : `/ai-tools/${tool.slug}`}
                  aria-disabled={off && !upgrade}
                  tabIndex={off && !upgrade ? -1 : undefined}
                  onClick={(e) => {
                    if (!off) return;
                    e.preventDefault();
                    if (upgrade) {
                      setRequestPrefill(t("ait.unlockRequest", { tool: t(tool.name) }));
                      setShowRequestTool(true);
                    }
                  }}
                  className={cn(
                    "group flex items-center gap-3.5 rounded-xl border border-line bg-surface px-4 py-3.5 shadow-card transition-all",
                    upgrade ? "hover:border-brand/40" : off ? "cursor-not-allowed opacity-50" : "hover:border-brand/40",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand-ink">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-display text-sm font-semibold text-foreground">{t(tool.name)}</span>
                      {upgrade ? (
                        <span className="inline-flex items-center gap-1 rounded bg-brand/15 px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-foreground">
                          <Lock className="h-2.5 w-2.5" />
                          {t("ait.upgrade")}
                        </span>
                      ) : (
                        <span className="rounded bg-line px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-muted">
                          {off ? t("prompts.inactive") : t(tool.category)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">{t(tool.description)}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Recently created */}
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-mono text-[11px] text-muted">{t("ait.recentlyCreated")}</h3>
          <button type="button" onClick={() => setShowHistory(true)} className="text-[13px] text-soft hover:text-foreground">
            {t("ait.history")}
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="card p-8 text-center">
            <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted" />
            <p className="text-sm text-muted">{t("ait.noResult")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((e) => {
              const def = AI_TOOLS.find((x) => x.slug === e.tool);
              return (
                <Link
                  key={e.id}
                  href={`/ai-tools/${e.tool}?h=${e.id}`}
                  className="card flex flex-col p-4 transition-all hover:border-brand/40"
                >
                  <span className="w-fit rounded bg-brand/10 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wide text-foreground">
                    {def ? t(def.name) : e.tool}
                  </span>
                  <p className="mt-2 line-clamp-3 flex-1 text-[13px] leading-relaxed text-soft">{e.output}</p>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[11.5px] text-muted">
                    <span className="truncate">{e.brand}</span>
                    <span className="shrink-0">
                      {new Date(e.at).toLocaleDateString("de-DE", { timeZone: APP_TZ, day: "numeric", month: "short" })}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <RequestToolModal open={showRequestTool} onClose={() => setShowRequestTool(false)} initialWhat={requestPrefill} />
    </div>
  );
}
