"use client";

import { ModalShell } from "@/components/ui/modal";
import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import { useActiveClient } from "@/components/providers/active-client-provider";

export function RequestToolModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [what, setWhat] = useState("");
  const [forClients, setForClients] = useState("all");
  const [frequency, setFrequency] = useState("weekly");
  const [manual, setManual] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { clients } = useActiveClient();

  async function submit() {
    if (!what.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch("/api/tool-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        what,
        manual,
        frequency,
        clientId: forClients === "all" ? undefined : forClients,
      }),
    }).catch(() => null);
    setSending(false);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setError(d.error ?? t("ait.actionFailed"));
      return;
    }
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setWhat("");
      setManual("");
      onClose();
    }, 1500);
  }

  return (
    <ModalShell open={open} onClose={onClose}>
              {/* Header */}
              <div className="flex items-start gap-4 px-6 pt-6 pb-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15">
                  <Sparkles className="h-5 w-5 text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-foreground">{t("reqTool.title")}</h2>
                  <p className="mt-0.5 text-sm text-muted">{t("reqTool.desc")}</p>
                </div>
                <button type="button" aria-label={t("widget.close")} onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Form */}
              <div className="space-y-4 px-6 pb-2">
                {/* What */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">{t("reqTool.whatLabel")}</label>
                  <textarea
                    value={what}
                    onChange={(e) => setWhat(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-brand/50 resize-none"
                  />
                </div>

                {/* Two selects */}
                <div className={clients.length ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : "grid grid-cols-1 gap-4"}>
                  {clients.length > 0 && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">{t("reqTool.forClients")}</label>
                    <select
                      value={forClients}
                      onChange={(e) => setForClients(e.target.value)}
                      className="h-11 w-full appearance-none rounded-xl border border-border bg-bg px-4 text-sm text-foreground outline-none focus:border-brand/50"
                    >
                      <option value="all" className="bg-surface">{t("reqTool.allAccounts")}</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id} className="bg-surface">
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  )}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">{t("reqTool.frequency")}</label>
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                      className="h-11 w-full appearance-none rounded-xl border border-border bg-bg px-4 text-sm text-foreground outline-none focus:border-brand/50"
                    >
                      <option value="weekly" className="bg-surface">{t("reqTool.freqWeekly")}</option>
                      <option value="daily" className="bg-surface">{t("reqTool.freqDaily")}</option>
                      <option value="monthly" className="bg-surface">{t("reqTool.freqMonthly")}</option>
                      <option value="rarely" className="bg-surface">{t("reqTool.freqRarely")}</option>
                    </select>
                  </div>
                </div>

                {/* Manual work */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">{t("reqTool.manualLabel")}</label>
                    <span className="text-xs text-muted">{t("reqTool.optional")}</span>
                  </div>
                  <textarea
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    rows={2}
                    className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-brand/50 resize-none"
                  />
                </div>
              </div>

              {error && <p role="alert" className="mx-6 mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

              {/* Footer */}
              <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-4 mt-2">
                <p className="text-xs text-muted leading-relaxed max-w-[260px]">{t("reqTool.footer")}</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
                  >
                    {t("common.cancel")}
                  </button>
                  <Button onClick={submit} loading={sending} disabled={!what.trim() || sent}>
                    {sent ? t("empty.requestSent") : t("reqTool.send")}
                  </Button>
                </div>
              </div>
    </ModalShell>
  );
}
