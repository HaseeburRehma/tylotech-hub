"use client";

import { ArrowLeft, Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { AuthShell } from "@/components/auth/auth-shell";
import { useT } from "@/lib/i18n/provider";

function ResendTimer({ onResend }: { onResend: () => Promise<void> }) {
  const t = useT();
  const [seconds, setSeconds] = useState(60);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [seconds]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;

  async function handleResend() {
    setSending(true);
    await onResend();
    setSending(false);
    setSeconds(60);
  }

  if (seconds > 0) {
    return (
      <button
        disabled
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3 text-sm text-muted"
      >
        <RefreshCw className="h-4 w-4" />
        {t("auth.resendIn", { time: timeStr })}
      </button>
    );
  }

  return (
    <Button variant="outline" className="w-full" onClick={handleResend} loading={sending}>
      <RefreshCw className="h-4 w-4" />
      {t("auth.resend")}
    </Button>
  );
}

export default function ResetPage() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendReset = useCallback(async (addr?: string) => {
    const target = addr ?? email;
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: target }),
    }).catch(() => null);
    if (!res?.ok) {
      setError("Something went wrong. Please try again.");
      return false;
    }
    return true;
  }, [email]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const ok = await sendReset();
    setLoading(false);
    if (ok) setSent(true);
  }

  return (
    <AuthShell
      hideThemeSwitcher
      panelHeadline={t("auth.resetHeadline")}
      panelTagline={t("auth.resetTagline")}
    >
      {sent ? (
        <>
          <div className="mb-8">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{t("auth.emailSentTitle")}</h1>
            <p className="mt-2 text-sm text-muted">{t("auth.emailSentSubtitle", { email })}</p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                <Mail className="h-5 w-5 text-brand" />
              </div>
              <div>
                <p className="text-sm font-semibold">{t("auth.linkSent")}</p>
                <p className="mt-1 text-sm text-muted">{t("auth.linkSentDesc")}</p>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <ResendTimer onResend={async () => { await sendReset(); }} />
          </div>

          <button
            onClick={() => { setSent(false); setEmail(""); }}
            className="mt-5 flex w-full items-center justify-center gap-1.5 text-sm text-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("auth.useOtherEmail")}
          </button>
        </>
      ) : (
        <>
          <div className="mb-8">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{t("auth.resetTitle")}</h1>
            <p className="mt-2 text-sm text-muted">{t("auth.resetSubtitle")}</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-danger">{error}</p>
            )}
            <div>
              <Label htmlFor="email">{t("auth.workEmail")}</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@tylotech.de" className="h-12 pl-10" />
              </div>
            </div>
            <Button type="submit" loading={loading} className="w-full" size="lg">
              {t("auth.sendLink")}
            </Button>
          </form>

          <Link href="/login" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            {t("auth.backToLogin")}
          </Link>
        </>
      )}
    </AuthShell>
  );
}
