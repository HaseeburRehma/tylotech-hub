"use client";

import { AlertCircle, CheckCircle2, CheckSquare, Loader2, Square } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/password-input";
import { AuthShell } from "@/components/auth/auth-shell";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

function PasswordStrength({ password }: { password: string }) {
  const t = useT();
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password)) score++;

  const labels = [
    t("auth.strengthWeak"),
    t("auth.strengthFair"),
    t("auth.strengthStrong"),
    t("auth.strengthVeryStrong"),
  ];
  const colors = ["bg-danger", "bg-warning", "bg-brand", "bg-success"];

  if (!password) return null;

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < score ? colors[score - 1] : "bg-border"
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-muted">{labels[Math.max(0, score - 1)]}</span>
    </div>
  );
}

function Rule({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {met ? (
        <CheckSquare className="h-4 w-4 text-brand" />
      ) : (
        <Square className="h-4 w-4 text-muted/40" />
      )}
      <span className={cn(met ? "text-foreground" : "text-muted")}>{label}</span>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense>
      <UpdatePasswordForm />
    </Suspense>
  );
}

function UpdatePasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useT();
  const welcome = params.get("welcome") === "1";
  const [session, setSession] = useState<"checking" | "ok" | "missing">(
    params.get("error") ? "missing" : "checking",
  );

  // The reset/invite link signs the user in via /auth/confirm; without that
  // session there's nothing to update, so explain instead of failing on submit.
  useEffect(() => {
    if (session !== "checking") return;
    const supabase = createClient();
    if (!supabase) return setSession("missing");
    supabase.auth.getUser().then(({ data }) => setSession(data.user ? "ok" : "missing"));
  }, [session]);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const has12 = pw.length >= 12;
  const hasMixed = /[A-Z]/.test(pw) && /[a-z]/.test(pw);
  const hasSpecial = /[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw);
  const allMet = has12 && hasMixed && hasSpecial && pw === pw2 && pw2.length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!has12) return setError(t("auth.rule12"));
    if (pw !== pw2) return setError(t("settings.pwMismatch"));
    const supabase = createClient();
    if (!supabase) return setError(t("settings.backendError"));
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/dashboard"), 1500);
  }

  return (
    <AuthShell
      hideThemeSwitcher
      panelHeadline={t("auth.resetHeadline")}
      panelTagline={t("auth.resetTagline")}
    >
      {session === "checking" ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : session === "missing" ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertCircle className="h-12 w-12 text-warning" />
          <p className="text-lg font-semibold">{t("auth.linkInvalidTitle")}</p>
          <p className="max-w-sm text-sm text-muted">{t("auth.linkInvalidBody")}</p>
          <Link href="/reset" className="mt-2">
            <Button>{t("auth.requestNewLink")}</Button>
          </Link>
        </div>
      ) : done ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="h-14 w-14 text-success" />
          <p className="text-lg font-semibold">{welcome ? t("auth.welcomeReady") : t("settings.pwUpdated")}</p>
          <p className="text-sm text-muted">{t("auth.redirectingDashboard")}</p>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {welcome ? t("auth.welcomeSetPwTitle") : t("auth.newPwTitle")}
            </h1>
            <p className="mt-2 text-sm text-muted">{welcome ? t("auth.welcomeSetPwBody") : t("auth.newPwSubtitle")}</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {error && <p className="text-sm text-danger">{error}</p>}
            <div>
              <Label htmlFor="pw">{t("auth.newPassword")}</Label>
              <PasswordInput id="pw" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••••••" />
              <PasswordStrength password={pw} />
            </div>
            <div>
              <Label htmlFor="pw2">{t("auth.confirmPassword")}</Label>
              <PasswordInput id="pw2" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="••••••••••••" />
            </div>

            <div className="space-y-2 pt-1">
              <Rule met={has12} label={t("auth.rule12")} />
              <Rule met={hasMixed} label={t("auth.ruleMixed")} />
              <Rule met={hasSpecial} label={t("auth.ruleSpecial")} />
            </div>

            <Button type="submit" loading={loading} className="w-full" size="lg" disabled={!allMet && !loading}>
              {t("auth.savePw")}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
