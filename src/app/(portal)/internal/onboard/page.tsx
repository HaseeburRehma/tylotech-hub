"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, ImagePlus, Loader2, Palette, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { buildClientTheme, themeToCssVars } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";

const PLANS = ["Starter", "Growth", "Scale", "Enterprise"];
const STEPS = [
  { title: "Company", icon: Building2 },
  { title: "Brand", icon: Palette },
  { title: "Access", icon: UserPlus },
];

export default function OnboardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; warning?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    company: "",
    plan: "Growth",
    mrr: "",
    primaryColor: "#C9A84C",
    secondaryColor: "#0A0A0A",
    logoUrl: "",
    clientName: "",
    clientEmail: "",
    clientPassword: "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function uploadLogo(file: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd }).catch(() => null);
    setUploading(false);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setError(data.error ?? "Logo upload failed.");
      return;
    }
    const { url } = await res.json();
    set("logoUrl", url);
  }

  // Live preview re-skins a scoped card to the chosen brand.
  const previewVars = useMemo(() => {
    const theme = buildClientTheme({
      id: "preview",
      company: form.company || "Your Client",
      primary: form.primaryColor,
      secondary: form.secondaryColor,
    });
    return themeToCssVars(theme) as React.CSSProperties;
  }, [form.company, form.primaryColor, form.secondaryColor]);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/clients/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create client.");
        setLoading(false);
        return;
      }
      setResult({ ok: true, warning: data.warning });
      setLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
        <h1 className="mt-4 text-2xl font-semibold">{form.company} onboarded</h1>
        <p className="mt-2 text-sm text-muted">
          Their branded portal is live. {form.clientEmail && `Login created for ${form.clientEmail}.`}
        </p>
        {result.warning && (
          <p className="mt-3 text-sm text-warning">{result.warning}</p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/internal">
            <Button variant="secondary">Back to hub</Button>
          </Link>
          <Button
            onClick={() => {
              setResult(null);
              setStep(0);
              setForm((f) => ({ ...f, company: "", mrr: "", clientName: "", clientEmail: "", clientPassword: "" }));
            }}
          >
            Onboard another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/internal" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Internal Hub
      </Link>
      <PageHeader title="Onboard a client" subtitle="Spin up a branded white-label portal in three steps." />

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = i === step;
          const complete = i < step;
          return (
            <div key={s.title} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl border text-sm transition-colors",
                  active
                    ? "border-brand bg-brand/15 text-brand"
                    : complete
                      ? "border-success/40 bg-success/15 text-success"
                      : "border-border text-muted",
                )}
              >
                {complete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={cn("hidden text-sm font-medium sm:block", active ? "text-foreground" : "text-muted")}>
                {s.title}
              </span>
              {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-6">
          {error && (
            <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {step === 0 && (
                <>
                  <div>
                    <Label htmlFor="company">Company name</Label>
                    <Input id="company" value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Acme Corp" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="plan">Plan</Label>
                      <select
                        id="plan"
                        value={form.plan}
                        onChange={(e) => set("plan", e.target.value)}
                        className="input-base appearance-none"
                      >
                        {PLANS.map((p) => (
                          <option key={p} value={p} className="bg-surface">{p}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="mrr">Monthly fee (€)</Label>
                      <Input id="mrr" type="number" value={form.mrr} onChange={(e) => set("mrr", e.target.value)} placeholder="4200" />
                    </div>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="primary">Primary color</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={form.primaryColor}
                          onChange={(e) => set("primaryColor", e.target.value)}
                          className="h-11 w-12 cursor-pointer rounded-lg border border-border bg-transparent"
                        />
                        <Input value={form.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} className="uppercase" />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="secondary">Secondary color</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={form.secondaryColor}
                          onChange={(e) => set("secondaryColor", e.target.value)}
                          className="h-11 w-12 cursor-pointer rounded-lg border border-border bg-transparent"
                        />
                        <Input value={form.secondaryColor} onChange={(e) => set("secondaryColor", e.target.value)} className="uppercase" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="logo">Logo</Label>
                    {form.logoUrl ? (
                      <div className="flex items-center gap-3 rounded-xl border border-border bg-bg/40 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={form.logoUrl} alt="Logo" className="h-12 w-12 rounded-lg object-contain" />
                        <span className="flex-1 truncate text-xs text-muted">Logo uploaded</span>
                        <button
                          type="button"
                          onClick={() => set("logoUrl", "")}
                          className="text-muted hover:text-danger"
                          aria-label="Remove logo"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-bg/40 px-4 py-6 text-sm text-muted transition-colors hover:border-brand/40 hover:text-foreground">
                        {uploading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                          </>
                        ) : (
                          <>
                            <ImagePlus className="h-4 w-4" /> Upload logo (PNG/SVG, max 2 MB)
                          </>
                        )}
                        <input
                          id="logo"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadLogo(f);
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    Colors become CSS variables across the client&apos;s entire portal; the logo replaces the
                    mark in their top-left.
                  </p>
                </>
              )}

              {step === 2 && (
                <>
                  <p className="text-sm text-muted">
                    Optionally create the client&apos;s first login now. You can also invite them later.
                  </p>
                  <div>
                    <Label htmlFor="cname">Contact name</Label>
                    <Input id="cname" value={form.clientName} onChange={(e) => set("clientName", e.target.value)} placeholder="Jane Doe" />
                  </div>
                  <div>
                    <Label htmlFor="cemail">Login email</Label>
                    <Input id="cemail" type="email" value={form.clientEmail} onChange={(e) => set("clientEmail", e.target.value)} placeholder="jane@acme.com" />
                  </div>
                  <div>
                    <Label htmlFor="cpass">Temporary password</Label>
                    <Input id="cpass" value={form.clientPassword} onChange={(e) => set("clientPassword", e.target.value)} placeholder="At least 8 characters" />
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !form.company.trim()}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={submit} loading={loading} disabled={!form.company.trim()}>
                Create client
              </Button>
            )}
          </div>
        </Card>

        {/* Live brand preview */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted/60">Live preview</p>
          <div style={previewVars} className="overflow-hidden rounded-2xl border border-border bg-bg p-4">
            <div className="mb-4 flex items-center gap-2.5">
              {form.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logoUrl} alt="Logo" className="h-9 w-9 rounded-lg object-contain" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15">
                  <span className="h-4 w-4 rounded-sm bg-brand" />
                </span>
              )}
              <span className="text-sm font-semibold text-foreground">{form.company || "Your Client"}</span>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-surface p-3">
                <p className="text-[11px] text-muted">Monthly Ad Spend</p>
                <p className="font-display text-lg font-semibold text-foreground">€18,400</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full w-2/3 rounded-full bg-brand" />
                </div>
              </div>
              <button className="w-full rounded-xl bg-brand py-2.5 text-sm font-medium text-brand-foreground">
                Primary action
              </button>
              <div className="flex gap-2">
                <Badge variant="brand">Brand badge</Badge>
                <span className="rounded-full border border-brand/40 px-2.5 py-1 text-xs text-brand">Outline</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
