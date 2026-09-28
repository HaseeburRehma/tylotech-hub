"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Building2, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const COLOR_SWATCHES = [
  "#3B5BDB",
  "#0E6580",
  "#C0392B",
  "#2DCDA2",
  "#C4943A",
  "#7C3AED",
];

type Plan = "growth" | "scale";

export function NewClientModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [plan, setPlan] = useState<Plan>("growth");
  const [mrr, setMrr] = useState("");
  const [since, setSince] = useState("");
  const [email, setEmail] = useState("");
  const [brandColor, setBrandColor] = useState(COLOR_SWATCHES[1]);
  const [hexInput, setHexInput] = useState(COLOR_SWATCHES[1]);

  function selectColor(c: string) {
    setBrandColor(c);
    setHexInput(c);
  }

  function onHexChange(v: string) {
    setHexInput(v);
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
      setBrandColor(v);
    }
  }

  async function submit() {
    if (!company.trim()) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/clients/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company,
        plan,
        mrr: parseInt(mrr.replace(/\D/g, ""), 10) || 0,
        primaryColor: brandColor,
        secondaryColor: brandColor,
        contactEmail: email || undefined,
        industry,
        since,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create client.");
      return;
    }
    setCompany("");
    setIndustry("");
    setMrr("");
    setEmail("");
    setSince("");
    onClose();
    router.refresh();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-foreground/25 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-[61] flex items-center justify-center p-4"
          >
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-bg shadow-float" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-start gap-4 px-6 pt-6 pb-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15">
                  <Building2 className="h-5 w-5 text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-foreground">{t("newClient.title")}</h2>
                  <p className="mt-0.5 text-sm text-muted">{t("newClient.desc")}</p>
                </div>
                <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Form */}
              <div className="space-y-4 px-6">
                {error && (
                  <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</div>
                )}

                {/* Company + Industry */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">{t("newClient.company")}</label>
                    <input
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="h-11 w-full rounded-xl border border-border bg-bg px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-brand/50"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">{t("newClient.industry")}</label>
                    <input
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="h-11 w-full rounded-xl border border-border bg-bg px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-brand/50"
                    />
                  </div>
                </div>

                {/* Plan */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">{t("newClient.plan")}</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPlan("growth")}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        plan === "growth"
                          ? "border-brand bg-brand/[0.04] ring-1 ring-brand/30"
                          : "border-border hover:border-brand/30",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-full border-2",
                          plan === "growth" ? "border-brand bg-brand" : "border-border",
                        )}>
                          {plan === "growth" && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                        <span className="text-sm font-semibold text-foreground">{t("newClient.growth")}</span>
                        <span className="ml-auto text-xs text-muted">{t("newClient.growthPrice")}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted leading-relaxed">{t("newClient.growthDesc")}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlan("scale")}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        plan === "scale"
                          ? "border-brand bg-brand/[0.04] ring-1 ring-brand/30"
                          : "border-border hover:border-brand/30",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-full border-2",
                          plan === "scale" ? "border-brand bg-brand" : "border-border",
                        )}>
                          {plan === "scale" && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                        <span className="text-sm font-semibold text-foreground">{t("newClient.scale")}</span>
                        <span className="ml-auto text-xs text-muted">{t("newClient.scalePrice")}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted leading-relaxed">{t("newClient.scaleDesc")}</p>
                    </button>
                  </div>
                </div>

                {/* MRR + Since */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">{t("newClient.mrr")}</label>
                    <input
                      value={mrr}
                      onChange={(e) => setMrr(e.target.value)}
                      placeholder="1.200 €"
                      className="h-11 w-full rounded-xl border border-border bg-bg px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-brand/50"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">{t("newClient.since")}</label>
                    <input
                      value={since}
                      onChange={(e) => setSince(e.target.value)}
                      placeholder="Oktober 2026"
                      className="h-11 w-full rounded-xl border border-border bg-bg px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-brand/50"
                    />
                  </div>
                </div>

                {/* Contact email */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">{t("newClient.contactEmail")}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-bg px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-brand/50"
                  />
                </div>

                {/* Brand color */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">{t("newClient.brandColor")}</label>
                    <span className="text-xs text-muted">{t("newClient.brandColorHint")}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {COLOR_SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => selectColor(c)}
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full transition-all",
                          brandColor === c ? "ring-2 ring-offset-2 ring-brand ring-offset-bg" : "hover:scale-110",
                        )}
                        style={{ backgroundColor: c }}
                      >
                        {brandColor === c && <Check className="h-4 w-4 text-white" />}
                      </button>
                    ))}
                    <input
                      value={hexInput}
                      onChange={(e) => onHexChange(e.target.value)}
                      className="ml-1 h-9 w-24 rounded-xl border border-border bg-bg px-3 text-sm font-mono text-foreground outline-none focus:border-brand/50"
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-4 mt-4">
                <p className="text-xs text-muted leading-relaxed max-w-[260px]">{t("newClient.footer")}</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
                  >
                    {t("common.cancel")}
                  </button>
                  <Button onClick={submit} loading={saving}>
                    {t("newClient.create")}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
