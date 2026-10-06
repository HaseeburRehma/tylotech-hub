"use client";

import { Bot } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AI_TOOLS } from "@/lib/ai-tools";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/** Staff switch individual AI tools on/off for one client (client_tools). */
export function ClientToolAccess({ clientId, locked }: { clientId: string; locked: string[] }) {
  const t = useT();
  const router = useRouter();
  const [off, setOff] = useState(() => new Set(locked));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function toggle(slug: string) {
    const enabled = off.has(slug);
    setBusy(slug);
    setError(false);
    const res = await fetch(`/api/clients/${clientId}/tools`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, enabled }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError(true);
    setOff((prev) => {
      const next = new Set(prev);
      if (enabled) next.delete(slug);
      else next.add(slug);
      return next;
    });
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        <Bot className="h-4 w-4 text-muted" /> {t("toolAccess.title")}
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        {t("toolAccess.subtitle", { n: AI_TOOLS.length - off.size, total: AI_TOOLS.length })}
      </p>
      {error && <p className="mt-2 text-xs text-danger">{t("ait.actionFailed")}</p>}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {AI_TOOLS.map((tool) => {
          const on = !off.has(tool.slug);
          return (
            <div key={tool.slug} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
              <span className={cn("text-sm", !on && "text-muted")}>{t(tool.name)}</span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={t(tool.name)}
                disabled={busy === tool.slug}
                onClick={() => toggle(tool.slug)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
                  on ? "bg-brand" : "bg-border",
                )}
              >
                <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-[18px]" : "translate-x-0.5")} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
