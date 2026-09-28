"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Link2,
  Mail,
  Phone,
  Play,
  Plus,
  Rocket,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const STEPS = ["ob.stepWelcome", "ob.stepProfile", "ob.stepChannels", "ob.stepTeam", "ob.stepDone"] as const;
const STEP_ICONS = [Rocket, User, Link2, Users, Check];

const CHANNELS = [
  { id: "search_console", name: "Search Console", category: "SEO", desc: "ob.scDesc", color: "#4285F4" },
  { id: "meta_ads", name: "Meta Ads", category: "ANZEIGEN", desc: "ob.metaDesc", color: "#0081FB" },
  { id: "google_ads", name: "Google Ads", category: "ANZEIGEN", desc: "ob.gadsDesc", color: "#FBBC04" },
  { id: "ga4", name: "GA4", category: "ANALYSE", desc: "ob.ga4Desc", color: "#E37400" },
];

const CHANNEL_DESCS: Record<string, Record<string, string>> = {
  search_console: { de: "Organische Klicks, Impressionen und Rankings", en: "Organic clicks, impressions and rankings" },
  meta_ads: { de: "Facebook- und Instagram-Budget, Leads und ROAS", en: "Facebook and Instagram budget, leads and ROAS" },
  google_ads: { de: "Leistung der Such- und Displaykampagnen", en: "Search and display campaign performance" },
  ga4: { de: "Sitzungen, Nutzer und Conversion-Tracking", en: "Sessions, users and conversion tracking" },
};

const ROLES = ["Designer", "Developer", "SEO Expert", "Head of Support", "Marketing Manager", "Account Manager"];

interface InviteRow {
  email: string;
  role: string;
}

function Stepper({ step, t }: { step: number; t: (k: string) => string }) {
  return (
    <nav className="space-y-1">
      {STEPS.map((key, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <div key={key} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs transition-colors",
                  done
                    ? "border-brand bg-brand text-white"
                    : current
                      ? "border-brand bg-transparent text-brand"
                      : "border-border bg-transparent text-muted",
                )}
              >
                {done && <Check className="h-3.5 w-3.5" />}
                {current && <span className="h-2 w-2 rounded-full bg-brand" />}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("mt-1 h-6 w-0.5", done ? "bg-brand" : "bg-border")} />
              )}
            </div>
            <div className="pt-0.5">
              <p className={cn("text-sm font-medium", current || done ? "text-foreground" : "text-muted")}>
                {t(key)}
              </p>
              {current && (
                <p className="text-xs text-brand">{t("ob.current")}</p>
              )}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function ProgressBar({ step, t }: { step: number; t: (k: string, v?: Record<string, string | number>) => string }) {
  const pct = Math.round(((step - 1) / (STEPS.length - 1)) * 100);
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between text-xs text-muted">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {t("ob.progress", { pct })}
        </div>
        <span className="font-mono text-[11px]">{t("ob.stepOf", { n: step, total: STEPS.length })}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const t = useT();
  const [step, setStep] = useState(0);
  const userName = "Dawood";

  const [profile, setProfile] = useState({ name: "", role: "", phone: "" });
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [invites, setInvites] = useState<InviteRow[]>([
    { email: "", role: "" },
    { email: "", role: "" },
    { email: "", role: "" },
  ]);

  const connectedCount = connected.size;

  // Step 0: Welcome
  if (step === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center bg-bg">
        <div className="flex w-full items-center p-8">
          <Logo size={34} showName />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm">
            <Avatar name="Ilias El Aradi" size={28} />
            {t("ob.invitedBy", { name: "Ilias El Aradi" })}
          </div>

          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("ob.welcomeTitle", { name: userName })}
          </h1>
          <p className="mt-3 max-w-lg text-muted">
            {t("ob.welcomeSubtitle")}
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            {STEPS.map((key, i) => {
              const Icon = STEP_ICONS[i];
              const active = i === 0;
              return (
                <div
                  key={key}
                  className={cn(
                    "flex w-28 flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors",
                    active ? "border-brand/40 bg-brand/5" : "border-border bg-surface",
                  )}
                >
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl",
                    active ? "bg-brand/15 text-brand" : "bg-surface-2 text-muted",
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-medium text-foreground">{t(key)}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-10 flex items-center gap-4">
            <Button size="lg" onClick={() => setStep(1)}>
              {t("ob.startSetup")} <ArrowRight className="h-4 w-4" />
            </Button>
            <span className="flex items-center gap-1.5 text-sm text-muted">
              <Clock className="h-4 w-4" />
              {t("ob.approx3min")}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Step 4+: Done
  if (step >= STEPS.length - 1) {
    const connectedSources = Array.from(connected);
    const firstSource = connectedSources.length > 0
      ? CHANNELS.find((c) => c.id === connectedSources[0])?.name ?? "—"
      : "—";
    const invitesSent = invites.filter((i) => i.email.trim()).length;

    return (
      <div className="flex min-h-screen flex-col items-center bg-bg">
        <div className="flex w-full items-center p-8">
          <Logo size={34} showName />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2">
            <Check className="h-7 w-7 text-brand" />
          </div>

          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("ob.doneTitle", { name: userName })}
          </h1>
          <p className="mt-3 max-w-lg text-muted">
            {t("ob.doneSubtitle", {
              source: firstSource,
              remaining: `${CHANNELS.length - connectedCount} ${CHANNELS.length - connectedCount === 1 ? "source" : "sources"}`,
            })}
          </p>

          <div className="mt-8 flex divide-x divide-border overflow-hidden rounded-xl border border-border">
            <div className="px-8 py-4 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">{t("ob.profile")}</p>
              <p className="mt-1 text-sm font-bold">{t("ob.profileStatus")}</p>
            </div>
            <div className="px-8 py-4 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">{t("ob.sources")}</p>
              <p className="mt-1 text-sm font-bold">{t("ob.sourcesStatus", { n: connectedCount, total: CHANNELS.length })}</p>
            </div>
            <div className="px-8 py-4 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">{t("ob.invitations")}</p>
              <p className="mt-1 text-sm font-bold">{t("ob.invitesStatus", { n: invitesSent })}</p>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-3">
            <Button size="lg" onClick={() => router.push("/dashboard")}>
              {t("ob.goToDashboard")} <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg">
              <Play className="h-4 w-4" />
              {t("ob.takeTour")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Steps 1–4: sidebar + content
  return (
    <div className="flex min-h-screen bg-bg">
      {/* Sidebar */}
      <div className="hidden w-64 flex-col justify-between border-r border-border p-8 lg:flex">
        <div>
          <div className="mb-8">
            <Logo size={34} showName />
          </div>
          <Stepper step={step} t={t} />
        </div>
        <div className="space-y-3">
          <ProgressBar step={step} t={t} />
          <button className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground">
            <Clock className="h-3.5 w-3.5" />
            {t("ob.continueLater")}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <div className="flex items-center justify-between border-b border-border p-4 lg:hidden">
          <Logo size={28} showName />
          <span className="text-xs text-muted">{t("ob.stepOf", { n: step, total: STEPS.length })}</span>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="w-full max-w-xl"
            >
              {/* Step 1: Profile */}
              {step === 1 && (
                <>
                  <h1 className="font-display text-3xl font-bold tracking-tight">{t("ob.profileTitle")}</h1>
                  <p className="mt-2 text-muted">{t("ob.profileSubtitle")}</p>

                  <div className="mt-8 flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-2">
                      <Upload className="h-5 w-5 text-muted" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{t("ob.addPhoto")}</p>
                      <p className="text-xs text-muted">{t("ob.photoHint")}</p>
                    </div>
                    <Button variant="outline" size="sm">{t("ob.chooseFile")}</Button>
                  </div>

                  <div className="mt-6 space-y-4">
                    <div>
                      <Label>{t("auth.fullName")}</Label>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        <Input
                          value={profile.name}
                          onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                          placeholder="Dawood Suleman"
                          className="h-12 pl-10"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <Label>{t("ob.roleLabel")}</Label>
                        <div className="relative">
                          <select
                            value={profile.role}
                            onChange={(e) => setProfile((p) => ({ ...p, role: e.target.value }))}
                            className="input-base h-12 w-full appearance-none pl-10"
                          >
                            <option value="">—</option>
                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        </div>
                      </div>
                      <div>
                        <Label>{t("ob.phoneLabel")}</Label>
                        <div className="relative">
                          <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                          <Input
                            value={profile.phone}
                            onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                            placeholder="+49 …"
                            className="h-12 pl-10"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Step 2: Connect channels */}
              {step === 2 && (
                <>
                  <h1 className="font-display text-3xl font-bold tracking-tight">{t("ob.channelsTitle")}</h1>
                  <p className="mt-2 text-muted">{t("ob.channelsSubtitle")}</p>

                  <div className="mt-8 space-y-3">
                    {CHANNELS.map((ch) => {
                      const isConnected = connected.has(ch.id);
                      const desc = CHANNEL_DESCS[ch.id]?.de ?? "";
                      return (
                        <div
                          key={ch.id}
                          className={cn(
                            "flex items-center gap-4 rounded-xl border p-4 transition-colors",
                            isConnected ? "border-brand/30 bg-brand/5" : "border-border bg-surface",
                          )}
                        >
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
                            style={{ backgroundColor: ch.color }}
                          >
                            {ch.name.charAt(0)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">{ch.name}</span>
                              <Badge variant="neutral" className="text-[9px]">{ch.category}</Badge>
                            </div>
                            <p className="text-xs text-muted">{desc}</p>
                          </div>
                          <Button
                            variant={isConnected ? "outline" : "outline"}
                            size="sm"
                            onClick={() => {
                              setConnected((prev) => {
                                const next = new Set(prev);
                                if (next.has(ch.id)) next.delete(ch.id);
                                else next.add(ch.id);
                                return next;
                              });
                            }}
                          >
                            {isConnected && <Check className="h-3.5 w-3.5 text-success" />}
                            {isConnected ? t("ob.connected") : t("ob.connect")}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Step 3: Invite team */}
              {step === 3 && (
                <>
                  <h1 className="font-display text-3xl font-bold tracking-tight">{t("ob.teamTitle")}</h1>
                  <p className="mt-2 text-muted">{t("ob.teamSubtitle")}</p>

                  <div className="mt-8 space-y-3">
                    {invites.map((inv, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                          <Input
                            type="email"
                            value={inv.email}
                            onChange={(e) => {
                              const next = [...invites];
                              next[i] = { ...next[i], email: e.target.value };
                              setInvites(next);
                            }}
                            placeholder="name@tylotech.de"
                            className="h-12 pl-10"
                          />
                        </div>
                        <select
                          value={inv.role}
                          onChange={(e) => {
                            const next = [...invites];
                            next[i] = { ...next[i], role: e.target.value };
                            setInvites(next);
                          }}
                          className="input-base h-12 w-40 appearance-none"
                        >
                          <option value="">{t("ob.selectRole")}</option>
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button
                          onClick={() => setInvites((prev) => prev.filter((_, j) => j !== i))}
                          className="p-2 text-muted hover:text-danger"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setInvites((prev) => [...prev, { email: "", role: "" }])}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-muted hover:border-brand/40 hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                      {t("ob.addAnother")}
                    </button>
                  </div>
                </>
              )}

              {/* Navigation */}
              <div className="mt-8 flex items-center justify-between">
                <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                  <ArrowLeft className="h-4 w-4" />
                  {t("ob.back")}
                </Button>
                <div className="flex items-center gap-3">
                  {step === 2 && connectedCount === 0 && (
                    <button
                      onClick={() => setStep((s) => s + 1)}
                      className="text-sm text-muted hover:text-foreground"
                    >
                      {t("ob.skipForNow")}
                    </button>
                  )}
                  {step === 3 && (
                    <button
                      onClick={() => setStep((s) => s + 1)}
                      className="text-sm text-muted hover:text-foreground"
                    >
                      {t("ob.skipInvites")}
                    </button>
                  )}
                  <Button
                    onClick={() => setStep((s) => s + 1)}
                  >
                    {step === 3 ? t("ob.sendInvites") : t("ob.next")}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
