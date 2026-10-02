"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  BarChart3,
  Globe,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  Link2,
  Mail,
  Megaphone,
  Phone,
  Play,
  Plus,
  Search,
  Share2,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { useI18n, useT } from "@/lib/i18n/provider";
import { ModalShell } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

const STEPS = ["ob.stepWelcome", "ob.stepProfile", "ob.stepChannels", "ob.stepTeam", "ob.stepDone"] as const;

const SERVICES = [
  { id: "website", icon: Globe, label: "Website" },
  { id: "seo", icon: Search, label: "SEO" },
  { id: "ads", icon: Megaphone, label: "Ads" },
  { id: "social", icon: Share2, label: "Social" },
  { id: "mail", icon: Mail, label: "Mail" },
];

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

const ROLES: string[] = ["Designer", "Developer", "SEO Expert", "Head of Support", "Marketing Manager", "Account Manager"];

interface InviteRow {
  email: string;
  name: string;
  role: string;
}

function Stepper({ step, t }: { step: number; t: (k: string) => string }) {
  const sidebarSteps = STEPS.slice(1);
  return (
    <nav className="space-y-1">
      {sidebarSteps.map((key, i) => {
        const stepIndex = i + 1;
        const done = stepIndex < step;
        const current = stepIndex === step;
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
              {i < sidebarSteps.length - 1 && (
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
  const pct = Math.round((step / (STEPS.length - 1)) * 100);
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

const STEP_KEY = "tylotech-hub:onboarding-step";

const TOUR = [
  { icon: LayoutDashboard, title: "ob.tour.dashTitle", desc: "ob.tour.dashDesc", href: "/dashboard" },
  { icon: BarChart3, title: "ob.tour.perfTitle", desc: "ob.tour.perfDesc", href: "/performance" },
  { icon: Link2, title: "ob.tour.intTitle", desc: "ob.tour.intDesc", href: "/integrations" },
  { icon: MessageCircle, title: "ob.tour.chatTitle", desc: "ob.tour.chatDesc", href: "/chat" },
];

function TourModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (open) setI(0);
  }, [open]);
  const slide = TOUR[i];
  const Icon = slide.icon;
  return (
    <ModalShell open={open} onClose={onClose} className="max-w-md">
      <div className="p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15 text-brand">
          <Icon className="h-7 w-7" />
        </span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-muted">
          {i + 1} / {TOUR.length}
        </p>
        <h2 className="mt-2 font-display text-xl font-semibold">{t(slide.title)}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t(slide.desc)}</p>
        <div className="mt-6 flex justify-center gap-1.5">
          {TOUR.map((_, j) => (
            <span key={j} className={cn("h-1.5 rounded-full transition-all", j === i ? "w-6 bg-brand" : "w-1.5 bg-border")} />
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => (i === 0 ? onClose() : setI(i - 1))}>
            {i === 0 ? t("common.cancel") : t("ob.back")}
          </Button>
          {i < TOUR.length - 1 ? (
            <Button onClick={() => setI(i + 1)}>
              {t("ob.next")} <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Link href={slide.href} onClick={onClose}>
              <Button>
                {t("ob.goToDashboard")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

export function OnboardingView({
  firstName,
  fullName,
  title,
  avatarUrl,
  workspace,
  isStaff,
  connectedProviders,
  liveProviders,
}: {
  firstName: string;
  fullName: string;
  title: string;
  avatarUrl: string | null;
  workspace: string;
  isStaff: boolean;
  connectedProviders: string[];
  liveProviders: string[];
}) {
  const router = useRouter();
  const t = useT();
  const { locale } = useI18n();
  const [step, setStepState] = useState(0);
  const userName = firstName;

  const setStep = (next: number | ((s: number) => number)) =>
    setStepState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      try {
        if (value >= STEPS.length - 1) window.localStorage.removeItem(STEP_KEY);
        else window.localStorage.setItem(STEP_KEY, String(value));
      } catch {}
      return value;
    });

  // Resume where the user left off (e.g. after an OAuth round-trip).
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(STEP_KEY));
      if (saved > 0 && saved < STEPS.length - 1) setStepState(saved);
    } catch {}
  }, []);

  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set(["website"]));
  const [profile, setProfile] = useState({ name: fullName, role: title, phone: "" });
  const [avatar, setAvatar] = useState(avatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitesSent, setInvitesSent] = useState(0);
  const [tourOpen, setTourOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const connected = new Set(connectedProviders);
  const [invites, setInvites] = useState<InviteRow[]>([
    { email: "", name: "", role: "" },
    { email: "", name: "", role: "" },
    { email: "", name: "", role: "" },
  ]);

  const connectedCount = connected.size;

  async function uploadAvatar(file: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/profile/avatar", { method: "POST", body: form }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError(d.error ?? t("ob.saveFailed"));
    setAvatar(d.url);
  }

  async function next() {
    setError(null);
    if (step === 1) {
      if (!profile.name.trim()) return setError(t("ob.nameRequired"));
      setBusy(true);
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name, title: profile.role, phone: profile.phone }),
      }).catch(() => null);
      setBusy(false);
      if (!res?.ok) {
        const d = res ? await res.json().catch(() => ({})) : {};
        return setError(d.error ?? t("ob.saveFailed"));
      }
    }
    if (step === 3) {
      const rows = invites.filter((i) => i.email.trim());
      if (rows.length) {
        setBusy(true);
        const res = await fetch("/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invites: rows.map((r) => ({ email: r.email, name: r.name, title: r.role })) }),
        }).catch(() => null);
        const d = res ? await res.json().catch(() => ({})) : {};
        setBusy(false);
        if (!res?.ok) return setError(d.error ?? t("ob.saveFailed"));
        const results = (d.results ?? []) as { email: string; status: string; error?: string }[];
        const failed = results.filter((r) => r.status === "error");
        const existing = results.filter((r) => r.status === "exists");
        setInvitesSent(results.filter((r) => r.status === "invited").length);
        if (failed.length || existing.length) {
          setInvites((prev) => prev.filter((i) => results.some((r) => r.email === i.email.trim().toLowerCase() && r.status !== "invited")));
          return setError(
            [
              existing.length ? t("ob.inviteExists", { emails: existing.map((r) => r.email).join(", ") }) : "",
              failed.length ? t("ob.inviteFailed", { emails: failed.map((r) => r.email).join(", ") }) : "",
            ]
              .filter(Boolean)
              .join(" "),
          );
        }
      }
    }
    setStep((s) => s + 1);
    if (step === 1) router.refresh();
  }

  // Step 0: Welcome
  if (step === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center bg-bg">
        <div className="flex w-full items-center p-8">
          <Logo size={34} showName />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm">
            <Avatar name={workspace} size={28} />
            {t("ob.workspaceBadge", { name: workspace })}
          </div>

          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("ob.welcomeTitle", { name: userName })}
          </h1>
          <p className="mt-3 max-w-lg text-muted">
            {t("ob.welcomeSubtitle")}
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            {SERVICES.map((svc) => {
              const active = selectedServices.has(svc.id);
              return (
                <button
                  key={svc.id}
                  onClick={() => {
                    setSelectedServices((prev) => {
                      const next = new Set(prev);
                      if (next.has(svc.id)) next.delete(svc.id);
                      else next.add(svc.id);
                      return next;
                    });
                  }}
                  className={cn(
                    "flex w-28 flex-col items-center gap-2 rounded-xl border p-4 text-center transition-colors",
                    active ? "border-brand/40 bg-brand/5" : "border-border bg-surface",
                  )}
                >
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl",
                    active ? "bg-brand/15 text-brand" : "bg-surface-2 text-muted",
                  )}>
                    <svc.icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-medium text-foreground">{svc.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button size="lg" onClick={() => setStep(1)}>
              {t("ob.startSetup")} <ArrowRight className="h-4 w-4" />
            </Button>
            <span className="flex items-center gap-1.5 text-sm text-muted">
              <Clock className="h-4 w-4" />
              {t("ob.approx3min")}
            </span>
            <span className="hidden text-muted/40 sm:inline">·</span>
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              {t("ob.skipSetup")}
            </button>
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

          <div className="mt-8 grid grid-cols-1 divide-y divide-border overflow-hidden rounded-xl border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-6 py-4 text-center sm:px-8">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">{t("ob.profile")}</p>
              <p className="mt-1 text-sm font-bold">{t("ob.profileStatus")}</p>
            </div>
            <div className="px-6 py-4 text-center sm:px-8">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">{t("ob.sources")}</p>
              <p className="mt-1 text-sm font-bold">{t("ob.sourcesStatus", { n: connectedCount, total: CHANNELS.length })}</p>
            </div>
            <div className="px-6 py-4 text-center sm:px-8">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">{t("ob.invitations")}</p>
              <p className="mt-1 text-sm font-bold">{t("ob.invitesStatus", { n: invitesSent })}</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={() => router.push("/dashboard")}>
              {t("ob.goToDashboard")} <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" onClick={() => setTourOpen(true)}>
              <Play className="h-4 w-4" />
              {t("ob.takeTour")}
            </Button>
            <TourModal open={tourOpen} onClose={() => setTourOpen(false)} />
          </div>
        </div>
      </div>
    );
  }

  // Steps 1–3: sidebar + content
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
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
          >
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
                    {avatar ? (
                      <Avatar name={profile.name || firstName} src={avatar} size={56} />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-2">
                        <Upload className="h-5 w-5 text-muted" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{t("ob.addPhoto")}</p>
                      <p className="text-xs text-muted">{t("ob.photoHint")}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} loading={busy}>
                      {t("ob.chooseFile")}
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void uploadAvatar(f);
                      }}
                    />
                  </div>

                  <div className="mt-6 space-y-4">
                    <div>
                      <Label>{t("auth.fullName")}</Label>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        <Input
                          value={profile.name}
                          onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                          placeholder={t("auth.fullName")}
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
                            {[...(profile.role && !ROLES.includes(profile.role) ? [profile.role] : []), ...ROLES].map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        </div>
                      </div>
                      <div>
                        <Label>{t("ob.phoneLabel")}</Label>
                        <div className="relative">
                          <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                          <Input
                            type="tel"
                            maxLength={40}
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
                      const desc = CHANNEL_DESCS[ch.id]?.[locale] ?? CHANNEL_DESCS[ch.id]?.de ?? "";
                      const live = liveProviders.includes(ch.id);
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
                          {isConnected ? (
                            <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-success/30 bg-success/10 px-3 text-sm font-medium text-success">
                              <Check className="h-3.5 w-3.5" />
                              {t("ob.connected")}
                            </span>
                          ) : isStaff ? (
                            <Link href="/integrations">
                              <Button variant="outline" size="sm">{t("ob.connect")}</Button>
                            </Link>
                          ) : live ? (
                            <a href={`/api/integrations/${ch.id}/oauth/start`}>
                              <Button variant="outline" size="sm">{t("ob.connect")}</Button>
                            </a>
                          ) : (
                            <span className="text-xs text-muted">{t("ob.viaTeam")}</span>
                          )}
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
                      <div key={i} className="relative rounded-xl border border-border p-3 sm:border-0 sm:p-0">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                              placeholder={isStaff ? "name@tylotech.de" : t("ob.emailPlaceholder")}
                              className="h-12 pl-10"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Input
                              value={inv.name}
                              onChange={(e) => {
                                const next = [...invites];
                                next[i] = { ...next[i], name: e.target.value };
                                setInvites(next);
                              }}
                              placeholder={t("auth.fullName")}
                              className="h-12 flex-1 sm:w-36 sm:flex-none"
                            />
                            <select
                              value={inv.role}
                              onChange={(e) => {
                                const next = [...invites];
                                next[i] = { ...next[i], role: e.target.value };
                                setInvites(next);
                              }}
                              className="input-base h-12 flex-1 appearance-none sm:w-40 sm:flex-none"
                            >
                              <option value="">{t("ob.selectRole")}</option>
                              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label={t("common.delete")}
                          onClick={() => setInvites((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute right-2 top-2 p-1 text-muted hover:text-danger sm:static sm:p-2"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setInvites((prev) => [...prev, { email: "", name: "", role: "" }])}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-muted hover:border-brand/40 hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                      {t("ob.addAnother")}
                    </button>
                  </div>
                </>
              )}

              {error && <p role="alert" className="mt-6 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

              {/* Navigation */}
              <div className="mt-8 flex items-center justify-between">
                <Button variant="outline" onClick={() => { setError(null); setStep((s) => s - 1); }} disabled={busy}>
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
                  <Button onClick={next} loading={busy}>
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
