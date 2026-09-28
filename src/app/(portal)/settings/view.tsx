"use client";

import {
  Bell,
  Camera,
  LogOut,
  Lock,
  Palette,
  ShieldCheck,
  Upload,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MfaSetup } from "@/components/settings/mfa-setup";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const TABS = ["profile", "security", "notifications", "appearance"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, React.ElementType> = {
  profile: User,
  security: Lock,
  notifications: Bell,
  appearance: Palette,
};

function Initials({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/15 text-xl font-semibold text-brand">
      {initials}
    </div>
  );
}

export function SettingsView({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}) {
  const router = useRouter();
  const t = useT();
  const [tab, setTab] = useState<Tab>("profile");
  const [displayName, setDisplayName] = useState(name);
  const [displayRole, setDisplayRole] = useState(role);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  async function saveProfile() {
    setSaving(true);
    setSaveError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: displayName }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setSaveError(d.error ?? t("settings.saveFailed"));
      setSaving(false);
      return;
    }
    setSaving(false);
    router.refresh();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (pw.length < 12) return setPwError(t("settings.pwTooShort"));
    if (pw !== pw2) return setPwError(t("settings.pwMismatch"));
    const supabase = createClient();
    if (!supabase) return setPwError(t("settings.backendError"));
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setPwError(error.message);
      setPwSaving(false);
      return;
    }
    setPw("");
    setPw2("");
    setPwSaving(false);
  }

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("settings.title")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("settings.subtitle")}</p>
        </div>
        <Button onClick={saveProfile} loading={saving}>
          {t("settings.saveChanges")}
        </Button>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* Sidebar nav */}
        <nav className="flex gap-2 overflow-x-auto lg:w-52 lg:shrink-0 lg:flex-col lg:gap-0 lg:space-y-1 lg:overflow-visible">
          {TABS.map((t_) => {
            const Icon = TAB_ICONS[t_];
            const label = t(`settings.${t_}`);
            const active = tab === t_;
            return (
              <button
                key={t_}
                onClick={() => setTab(t_)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors lg:w-full lg:gap-2.5",
                  active
                    ? "bg-brand/10 text-brand"
                    : "text-muted hover:bg-surface hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}

          <div className="hidden lg:block lg:!mt-4 lg:border-t lg:border-border lg:pt-4">
            <button
              onClick={signOut}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-danger hover:bg-danger/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {t("settings.signOut")}
            </button>
          </div>
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-6">
          {tab === "profile" && (
            <>
              {/* Profile section */}
              <section className="rounded-2xl border border-border bg-bg p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">{t("settings.profile")}</h2>
                  <p className="text-sm text-muted">{t("settings.profileDesc")}</p>
                </div>

                {/* Avatar row */}
                <div className="flex items-center gap-5">
                  <div className="relative">
                    <Initials name={displayName || "U"} />
                    <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg bg-surface text-muted">
                      <Camera className="h-3 w-3" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{t("settings.avatar")}</p>
                    <p className="text-xs text-muted">{t("settings.avatarHint")}</p>
                  </div>
                  <Button variant="outline" size="sm">
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    {t("settings.upload")}
                  </Button>
                </div>

                {/* Name + Role */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="s-name">{t("settings.fullName")}</Label>
                    <Input
                      id="s-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="s-role">{t("settings.role")}</Label>
                    <Input id="s-role" value={displayRole} onChange={(e) => setDisplayRole(e.target.value)} />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <Label htmlFor="s-email">{t("settings.workEmail")}</Label>
                  <Input id="s-email" value={email} disabled className="opacity-60" />
                </div>

                {saveError && <p className="text-sm text-danger">{saveError}</p>}
              </section>

              {/* Security section */}
              <section className="rounded-2xl border border-border bg-bg p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">{t("settings.security")}</h2>
                  <p className="text-sm text-muted">{t("settings.securityDesc")}</p>
                </div>

                {/* Password fields */}
                <form onSubmit={changePassword}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="s-pw">{t("settings.newPassword")}</Label>
                      <Input
                        id="s-pw"
                        type="password"
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        placeholder={t("settings.min12")}
                      />
                    </div>
                    <div>
                      <Label htmlFor="s-pw2">{t("settings.confirmPassword")}</Label>
                      <Input
                        id="s-pw2"
                        type="password"
                        value={pw2}
                        onChange={(e) => setPw2(e.target.value)}
                        placeholder={t("settings.repeatPw")}
                      />
                    </div>
                  </div>
                  {pwError && <p className="mt-2 text-sm text-danger">{pwError}</p>}
                </form>

                {/* 2FA toggle */}
                <div className="flex items-center gap-4 rounded-xl border border-border bg-surface/50 px-4 py-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                    <ShieldCheck className="h-5 w-5 text-brand" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{t("settings.2fa")}</p>
                    <p className="text-xs text-muted">{t("settings.2faDesc")}</p>
                  </div>
                  <MfaToggle />
                </div>
              </section>
            </>
          )}

          {tab === "security" && (
            <MfaSetup />
          )}

          {tab === "notifications" && (
            <section className="rounded-2xl border border-border bg-bg p-6">
              <h2 className="text-lg font-semibold">{t("settings.notifications")}</h2>
              <p className="mt-1 text-sm text-muted">Coming soon</p>
            </section>
          )}

          {tab === "appearance" && (
            <section className="rounded-2xl border border-border bg-bg p-6">
              <h2 className="text-lg font-semibold">{t("settings.appearance")}</h2>
              <p className="mt-1 text-sm text-muted">Coming soon</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function MfaToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      if (!supabase) { setLoading(false); return; }
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.find((f: { status: string }) => f.status === "verified");
      setEnabled(!!totp);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="h-6 w-11 rounded-full bg-border animate-pulse" />;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        enabled ? "bg-brand" : "bg-border",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          enabled ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
