"use client";

import { AiHistoryModal } from "@/components/modals/ai-history-modal";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Clock,
  FileText,
  LayoutTemplate,
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
import { Badge } from "@/components/ui/badge";
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
  const [recent, setRecent] = useState<AiHistoryEntry[]>([]);
  useEffect(() => {
    setRecent(readAiHistory(user.id).slice(0, 4));
    const sb = createClient();
    if (!sb) return;
    Promise.all([
      sb.from("ai_tools").select("slug,is_active"),
      user.role === "client" ? lockedToolSlugs(sb, user.client_id) : Promise.resolve(new Set<string>()),
    ]).then(([{ data }, locked]) => {
      const off = new Set(locked);
      for (const r of data ?? []) if (r.is_active === false) off.add(r.slug);
      setInactive(off);
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
  const [showHistory, setShowHistory] = useState(false);
  const firstName = user.name?.split(" ")[0] ?? "";

  return (
    <div className="space-y-8">
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
          className="font-display text-3xl font-semibold tracking-tight md:text-4xl"
        >
          {(() => {
            const parts = t("ait.heroTitle").split("{start}");
            return (
              <>
                {parts[0]}
                <em className="not-italic text-brand">{t("ait.heroStart")}</em>
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
          className="mx-auto mt-2 max-w-lg text-sm text-muted"
        >
          {t("ait.heroSubtitle")}
        </motion.p>
      </div>

      {/* Chat input */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="mx-auto max-w-2xl"
      >
        <div className="rounded-2xl bg-foreground p-4">
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
            rows={2}
            className="w-full resize-none bg-transparent text-sm text-bg placeholder:text-bg/40 focus:outline-none"
          />
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-bg/10 px-2.5 py-1 text-xs text-bg/70">
                {user.name?.split(" ")[0] ?? "Client"}
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
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">{t("ait.readyTools")}</h3>
            <Badge variant="brand" className="text-[10px]">
              {t("ait.toolsAvailable", { n: unlocked, total: AI_TOOLS.length })}
            </Badge>
          </div>
          <button onClick={() => setShowRequestTool(true)} className="text-sm text-muted hover:text-foreground transition-colors">
            {t("ait.requestOwnTool")}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AI_TOOLS.map((tool, i) => {
            const Icon = ICONS[tool.icon] ?? Bot;
            const off = inactive.has(tool.slug);
            return (
              <motion.div
                key={tool.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.04 }}
              >
                <Link
                  href={off ? "#" : `/ai-tools/${tool.slug}`}
                  aria-disabled={off}
                  tabIndex={off ? -1 : undefined}
                  onClick={(e) => off && e.preventDefault()}
                  className={cn(
                    "group flex items-center gap-3.5 rounded-xl border border-border bg-surface p-4 transition-all",
                    off ? "cursor-not-allowed opacity-50" : "hover:shadow-card",
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{t(tool.name)}</span>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {off ? t("prompts.inactive") : t(tool.category)}
                      </Badge>
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
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("ait.recentlyCreated")}</h3>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-8 text-center">
            <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted" />
            <p className="text-sm text-muted">{t("ait.noResult")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {recent.map((e) => {
              const def = AI_TOOLS.find((x) => x.slug === e.tool);
              return (
                <Link
                  key={e.id}
                  href={`/ai-tools/${e.tool}?h=${e.id}`}
                  className="rounded-xl border border-border bg-surface p-4 transition-all hover:shadow-card"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{def ? t(def.name) : e.tool}</span>
                    <span className="shrink-0 text-[11px] text-muted">
                      {new Date(e.at).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{e.brand}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted/80">{e.output}</p>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <RequestToolModal open={showRequestTool} onClose={() => setShowRequestTool(false)} />
    </div>
  );
}
