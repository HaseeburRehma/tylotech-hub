"use client";

import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
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
      setError(t("auth.resetError") ?? "Something went wrong. Please try again.");
      return;
    }
    setSent(true);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/4 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-brand/[0.12] blur-[140px]" />
      </div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={44} showName={false} />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t("auth.resetTitle") ?? "Reset your password"}</h1>
          <p className="mt-1.5 text-sm text-muted">{t("auth.resetSubtitle") ?? "We'll email you a secure reset link."}</p>
        </div>
        <div className="card p-7 shadow-float">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="font-medium">{t("auth.checkInbox") ?? "Check your inbox"}</p>
              <p className="text-sm text-muted">
                {t("auth.resetSent") ?? `If an account exists for ${email}, a reset link is on its way.`}
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {error && <p className="text-sm text-danger">{error}</p>}
              <div>
                <Label htmlFor="email">{t("auth.email")}</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="pl-10" />
                </div>
              </div>
              <Button type="submit" loading={loading} className="w-full" size="lg">
                {t("auth.sendResetLink") ?? "Send reset link"}
              </Button>
            </form>
          )}
        </div>
        <Link href={`/${slug}/login`} className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("auth.backToSignIn") ?? "Back to sign in"}
        </Link>
      </motion.div>
    </div>
  );
}
