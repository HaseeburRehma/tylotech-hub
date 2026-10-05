"use client";

import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";

export function ClientResetForm({ slug }: { slug: string }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      setError(t(res?.status === 429 ? "auth.resetTooMany" : "auth.resetError"));
      return;
    }
    setSent(true);
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t("auth.resetTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("auth.resetSubtitle")}</p>
      </div>
      {sent ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-success" />
          <p className="font-medium">{t("auth.checkInbox")}</p>
          <p className="text-sm text-muted">{t("auth.resetSent", { email })}</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div>
            <Label htmlFor="email">{t("auth.email")}</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="h-12 pl-10"
              />
            </div>
          </div>
          <Button type="submit" loading={loading} className="w-full" size="lg">
            {t("auth.sendResetLink")}
          </Button>
        </form>
      )}
      <Link href={`/${slug}/login`} className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t("auth.backToSignIn")}
      </Link>
    </>
  );
}
