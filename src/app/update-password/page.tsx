"use client";

import { CheckCircle2, CheckSquare, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const router = useRouter();
  const t = useT();
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
    if (pw !== pw2) return setError("Passwords don't match.");
    const supabase = createClient();
    if (!supabase) return setError("Backend not configured.");
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
      {done ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="h-14 w-14 text-success" />
          <p className="text-lg font-semibold">{t("auth.created")}</p>
          <p className="text-sm text-muted">{t("auth.takingYou")}</p>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{t("auth.newPwTitle")}</h1>
            <p className="mt-2 text-sm text-muted">{t("auth.newPwSubtitle")}</p>
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
