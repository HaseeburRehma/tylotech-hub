"use client";

import { Bell, Camera, Check, Globe, Loader2, LogOut, Moon, Palette, ShieldCheck, Trash2, Upload, User } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { MfaSetup } from "@/components/settings/mfa-setup";
import { DarkModeToggle } from "@/components/layout/sidebar";
import { createClient } from "@/lib/supabase/client";
import { useI18n, useT } from "@/lib/i18n/provider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { currentLoginPath } from "@/lib/login-brand";
import { leadSoundEnabled, playLeadSound, setLeadSoundEnabled } from "@/lib/lead-sound";
import { useRefresh } from "@/components/providers/refresh-provider";

const TABS = ["profile", "security", "notifications", "appearance"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, React.ElementType> = {
  profile: User,
  security: ShieldCheck,
  notifications: Bell,
  appearance: Palette,
};

export function SettingsView({
  name,
  email,
  role,
  title,
  avatarUrl,
  notifyEmail,
  leadEmail,
  staff,
}: {
  name: string;
  email: string;
  role: string;
  title: string;
  avatarUrl: string | null;
  notifyEmail: boolean;
  leadEmail: boolean;
  staff: boolean;
}) {
  const router = useRouter();
  const refresh = useRefresh();
  const t = useT();
  const { locale, setLocale } = useI18n();
  const params = useSearchParams();
  const initialTab = params.get("tab") as Tab | null;
  const [tab, setTabState] = useState<Tab>(initialTab && TABS.includes(initialTab) ? initialTab : "profile");
  // Keep the tab in the URL so links (e.g. from the notifications bell) can open it.
  const setTab = (next: Tab) => {
    setTabState(next);
    router.replace(next === "profile" ? "/settings" : `/settings?tab=${next}`, { scroll: false });
  };

  const [displayName, setDisplayName] = useState(name);
  const [jobTitle, setJobTitle] = useState(title);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [avatar, setAvatar] = useState(avatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [emailNotif, setEmailNotif] = useState(notifyEmail);
  const [notifSaving, setNotifSaving] = useState(false);
  const [leadMail, setLeadMail] = useState(leadEmail);
  const [leadSaving, setLeadSaving] = useState(false);
  // Per device (localStorage), read after mount so server and client render alike.
  const [leadSound, setLeadSound] = useState(true);
  useEffect(() => setLeadSound(leadSoundEnabled()), []);

  const dirty = displayName.trim() !== name || jobTitle.trim() !== title;

  async function saveProfile() {
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: displayName, title: jobTitle }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setSaveMsg({ ok: false, text: d.error ?? t("settings.saveFailed") });
      return;
    }
    setSaveMsg({ ok: true, text: t("settings.saved") });
    refresh();
  }

  async function uploadAvatar(file: File) {
    setAvatarBusy(true);
    setAvatarError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/profile/avatar", { method: "POST", body: form }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setAvatarBusy(false);
    if (!res?.ok) return setAvatarError(d.error ?? t("settings.saveFailed"));
    setAvatar(d.url);
    refresh();
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    setAvatarError(null);
    const res = await fetch("/api/profile/avatar", { method: "DELETE" }).catch(() => null);
    setAvatarBusy(false);
    if (!res?.ok) return setAvatarError(t("settings.saveFailed"));
    setAvatar(null);
    refresh();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (pw.length < 12) return setPwMsg({ ok: false, text: t("settings.pwTooShort") });
    if (pw !== pw2) return setPwMsg({ ok: false, text: t("settings.pwMismatch") });
    const supabase = createClient();
    if (!supabase) return setPwMsg({ ok: false, text: t("settings.backendError") });
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwSaving(false);
    if (error) return setPwMsg({ ok: false, text: error.message });
    setPw("");
    setPw2("");
    setPwMsg({ ok: true, text: t("settings.pwUpdated") });
  }

  async function toggleEmailNotif(next: boolean) {
    setEmailNotif(next);
    setNotifSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyEmail: next }),
    }).catch(() => null);
    setNotifSaving(false);
    if (!res?.ok) setEmailNotif(!next);
  }

  async function toggleLeadMail(next: boolean) {
    setLeadMail(next);
    setLeadSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadEmail: next }),
    }).catch(() => null);
    setLeadSaving(false);
    if (!res?.ok) setLeadMail(!next);
  }

  function toggleLeadSound(next: boolean) {
    setLeadSound(next);
    setLeadSoundEnabled(next);
    if (next) void playLeadSound({ force: true });
  }

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push(currentLoginPath());
  }

  const feedback = (m: { ok: boolean; text: string } | null) =>
    m && (
      <p role="status" className={cn("flex items-center gap-1.5 text-sm", m.ok ? "text-success" : "text-danger")}>
        {m.ok && <Check className="h-4 w-4" />}
        {m.text}
      </p>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-h1 font-semibold tracking-[-0.02em] md:text-2xl">{t("settings.title")}</h1>
          <p className="mt-1 text-body-sm text-muted">{t("settings.subtitle")}</p>
        </div>
        {tab === "profile" && (
          <Button onClick={saveProfile} loading={saving} disabled={!dirty} className="w-full sm:w-auto">
            {t("settings.saveChanges")}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:sticky lg:top-0 lg:w-52 lg:shrink-0 lg:flex-col lg:gap-0 lg:space-y-1 lg:self-start lg:overflow-visible lg:pb-0">
          {TABS.map((key) => {
            const Icon = TAB_ICONS[key];
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors lg:w-full lg:gap-2.5 lg:border-transparent lg:py-2.5",
                  active
                    ? "border-brand/30 bg-brand/10 text-foreground"
                    : "border-border bg-surface text-soft hover:text-foreground lg:bg-transparent lg:hover:bg-surface",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-brand-ink" : "text-muted")} />
                {t(`settings.${key}`)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={signOut}
            className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-negative transition-colors hover:bg-negative/10 lg:!mt-6 lg:w-full lg:gap-2.5 lg:py-2.5"
          >
            <LogOut className="h-4 w-4" />
            {t("settings.signOut")}
          </button>
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          {tab === "profile" && (
            <Panel>
              <PanelHeader title={t("settings.profile")} subtitle={t("settings.profileDesc")} />
              <div className="space-y-6 p-5 sm:p-6">

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                <div className="relative w-fit shrink-0">
                  <Avatar name={displayName || "U"} src={avatar} size={64} className="text-xl" />
                  <button
                    type="button"
                    aria-label={t("settings.upload")}
                    onClick={() => fileRef.current?.click()}
                    className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg bg-surface text-muted hover:text-foreground"
                  >
                    {avatarBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t("settings.avatar")}</p>
                  <p className="text-xs text-muted">{t("settings.avatarHint")}</p>
                  {avatarError && <p className="mt-1 text-xs text-danger">{avatarError}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {avatar && (
                    <Button variant="outline" size="sm" onClick={removeAvatar} disabled={avatarBusy}>
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("settings.removePhoto")}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={avatarBusy}>
                    <Upload className="h-3.5 w-3.5" />
                    {t("settings.upload")}
                  </Button>
                </div>
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="s-name">{t("settings.fullName")}</Label>
                  <Input id="s-name" value={displayName} maxLength={120} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="s-title">{t("settings.role")}</Label>
                  <Input
                    id="s-title"
                    value={jobTitle}
                    maxLength={80}
                    placeholder={role}
                    onChange={(e) => setJobTitle(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="s-email">{t("settings.workEmail")}</Label>
                  <Input id="s-email" value={email} disabled className="opacity-60" />
                </div>
                <div>
                  <Label htmlFor="s-access">{t("settings.access")}</Label>
                  <Input id="s-access" value={role} disabled className="opacity-60" />
                </div>
              </div>

              {feedback(saveMsg)}
              </div>
            </Panel>
          )}

          {tab === "security" && (
            <>
              <Panel>
              <PanelHeader title={t("settings.password")} subtitle={t("settings.passwordDesc")} />
              <div className="space-y-5 p-5 sm:p-6">
                <form onSubmit={changePassword} className="space-y-4">
                  <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="s-pw">{t("settings.newPassword")}</Label>
                      <Input
                        id="s-pw"
                        type="password"
                        autoComplete="new-password"
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
                        autoComplete="new-password"
                        value={pw2}
                        onChange={(e) => setPw2(e.target.value)}
                        placeholder={t("settings.repeatPw")}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" variant="outline" loading={pwSaving} disabled={!pw || !pw2}>
                      {t("settings.updatePassword")}
                    </Button>
                    {feedback(pwMsg)}
                  </div>
                </form>
                </div>
            </Panel>

              <MfaSetup />
            </>
          )}

          {tab === "notifications" && (
            <Panel>
              <PanelHeader title={t("settings.notifications")} subtitle={t("settings.notificationsDesc")} />
              <div className="space-y-5 p-5 sm:p-6">
              <div className="flex items-center gap-4 rounded-xl border border-line bg-bg px-4 py-3.5">
                <div className="flex-1">
                  <p className="text-sm font-semibold">{t("settings.emailNotif")}</p>
                  <p className="text-xs text-muted">{t("settings.emailNotifDesc", { email })}</p>
                </div>
                <Switch checked={emailNotif} onChange={toggleEmailNotif} disabled={notifSaving} label={t("settings.emailNotif")} />
              </div>
              <div className="flex items-center gap-4 rounded-xl border border-line bg-bg px-4 py-3.5">
                <div className="flex-1">
                  <p className="text-sm font-semibold">{t("settings.leadEmail")}</p>
                  <p className="text-xs text-muted">{t(staff ? "settings.leadEmailDescStaff" : "settings.leadEmailDesc", { email })}</p>
                </div>
                <Switch checked={leadMail} onChange={toggleLeadMail} disabled={leadSaving} label={t("settings.leadEmail")} />
              </div>
              <div className="flex items-center gap-4 rounded-xl border border-line bg-bg px-4 py-3.5">
                <div className="flex-1">
                  <p className="text-sm font-semibold">{t("settings.leadSound")}</p>
                  <p className="text-xs text-muted">{t("settings.leadSoundDesc")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void playLeadSound({ force: true })}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-ink transition-colors hover:bg-surface-2"
                >
                  {t("settings.leadSoundTest")}
                </button>
                <Switch checked={leadSound} onChange={toggleLeadSound} label={t("settings.leadSound")} />
              </div>
              <div className="flex items-center gap-4 rounded-xl border border-line bg-bg px-4 py-3.5">
                <div className="flex-1">
                  <p className="text-sm font-semibold">{t("settings.inAppNotif")}</p>
                  <p className="text-xs text-muted">{t("settings.inAppNotifDesc")}</p>
                </div>
                <span className="text-xs font-medium text-success">{t("settings.alwaysOn")}</span>
              </div>
              </div>
            </Panel>
          )}

          {tab === "appearance" && (
            <Panel>
              <PanelHeader title={t("settings.appearance")} subtitle={t("settings.appearanceDesc")} />
              <div className="space-y-5 p-5 sm:p-6">
              <div className="flex items-center gap-4 rounded-xl border border-line bg-bg px-4 py-3.5">
                <Moon className="h-5 w-5 text-muted" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{t("sidebar.darkMode")}</p>
                  <p className="text-xs text-muted">{t("settings.darkModeDesc")}</p>
                </div>
                <DarkModeToggle />
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-line bg-bg px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                <Globe className="hidden h-5 w-5 text-muted sm:block" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{t("account.language")}</p>
                  <p className="text-xs text-muted">{t("settings.languageDesc")}</p>
                </div>
                <div className="flex w-fit items-center gap-1 rounded-xl border border-border bg-surface p-1">
                  {(["de", "en"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={locale === l}
                      onClick={() => setLocale(l)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm transition-colors",
                        locale === l ? "bg-brand/10 font-medium text-foreground" : "text-muted hover:text-foreground",
                      )}
                    >
                      {l === "de" ? "Deutsch" : "English"}
                    </button>
                  ))}
                </div>
              </div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
