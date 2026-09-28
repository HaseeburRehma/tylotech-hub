"use client";

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
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { RequestToolModal } from "@/components/modals/request-tool-modal";
import { useT } from "@/lib/i18n/provider";
import { useUser } from "@/components/providers/user-provider";
import { AI_TOOLS } from "@/lib/mock/data";
import { cn } from "@/lib/utils";

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
  const unlocked = AI_TOOLS.filter((tool) => tool.unlocked).length;
  const [prompt, setPrompt] = useState("");
  const [showRequestTool, setShowRequestTool] = useState(false);
  const firstName = user.name?.split(" ")[0] ?? "";

  return (
    <div className="space-y-8">
      <PageHeader title={t("ai.title")} subtitle={t("ai.subtitle")}>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <FileText className="h-4 w-4" />
            {t("ait.brandRules")}
          </Button>
          <Button variant="outline" size="sm">
            <Clock className="h-4 w-4" />
            {t("ait.history")}
          </Button>
        </div>
      </PageHeader>

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
              {unlocked} von {AI_TOOLS.length} frei
            </Badge>
          </div>
          <button onClick={() => setShowRequestTool(true)} className="text-sm text-muted hover:text-foreground transition-colors">
            {t("ait.requestOwnTool")}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AI_TOOLS.map((tool, i) => {
            const Icon = ICONS[tool.icon] ?? Bot;
            return (
              <motion.div
                key={tool.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.04 }}
              >
                <Link
                  href={`/ai-tools/${tool.slug}`}
                  className="group flex items-center gap-3.5 rounded-xl border border-border bg-surface p-4 transition-all hover:shadow-card"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{t(tool.name)}</span>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {t(tool.category)}
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
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted" />
          <p className="text-sm text-muted">{t("ait.noResult")}</p>
        </div>
      </div>

      <RequestToolModal open={showRequestTool} onClose={() => setShowRequestTool(false)} />
    </div>
  );
}
