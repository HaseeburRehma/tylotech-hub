"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  LayoutTemplate,
  Lock,
  Mail,
  Megaphone,
  PenLine,
  Search,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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
  const unlocked = AI_TOOLS.filter((t) => t.unlocked).length;

  return (
    <div className="space-y-6">
      <PageHeader title="AI Tools" subtitle="Claude-powered tools tuned to your brand. Unlock more as add-ons.">
        <Badge variant="brand" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          {unlocked} of {AI_TOOLS.length} unlocked
        </Badge>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AI_TOOLS.map((tool, i) => {
          const Icon = ICONS[tool.icon] ?? Bot;
          const available = tool.is_active && tool.unlocked;
          const inner = (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                "card group relative flex h-full flex-col p-5 transition-all duration-300",
                available
                  ? "card-hover cursor-pointer"
                  : "opacity-80",
              )}
            >
              <div className="mb-4 flex items-center justify-between">
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl",
                    available ? "bg-brand/15 text-brand" : "bg-surface-2 text-muted",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {!tool.unlocked ? (
                  <Badge variant="warning" className="gap-1">
                    <Lock className="h-3 w-3" /> Upgrade
                  </Badge>
                ) : !tool.is_active ? (
                  <Badge variant="neutral">Soon</Badge>
                ) : (
                  <Badge variant="success">Ready</Badge>
                )}
              </div>

              <h3 className="text-base font-semibold">{tool.name}</h3>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">{tool.description}</p>

              <div className="mt-4 flex items-center justify-between">
                <Badge variant="outline">{tool.category}</Badge>
                {available ? (
                  <span className="flex items-center gap-1 text-sm font-medium text-brand">
                    Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                ) : !tool.unlocked ? (
                  <span className="text-xs font-medium text-warning">+ €99/mo</span>
                ) : (
                  <span className="text-xs text-muted">Coming soon</span>
                )}
              </div>
            </motion.div>
          );

          return available ? (
            <Link key={tool.id} href={`/ai-tools/${tool.slug}`}>
              {inner}
            </Link>
          ) : (
            <div key={tool.id}>{inner}</div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-surface/40 p-6 text-center">
        <h3 className="text-base font-semibold">Need a custom AI tool?</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          We build bespoke Claude-powered tools tailored to your workflow. Tell us what you need.
        </p>
        <Link href="/chat" className="mt-4 inline-block">
          <Button variant="outline" size="sm">Request a tool</Button>
        </Link>
      </div>
    </div>
  );
}
