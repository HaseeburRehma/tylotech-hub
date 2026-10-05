"use client";

import { safeRedirect } from "@/lib/safe-redirect";
import { AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { AuthShell } from "@/components/auth/auth-shell";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/provider";

function MfaVerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useT();
  const redirectTo = safeRedirect(params.get("redirect"));
  const inputRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);

  useEffect(() => {
    // Get the TOTP factor to verify against
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const totp = data?.totp?.[0];
      if (totp) setFactorId(totp.id);
    });
    inputRef.current?.focus();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;

    setError(null);
    setLoading(true);

    const supabase = createClient()!;

    const { data: challenge, error: challengeErr } =
      await supabase.auth.mfa.challenge({ factorId });

    if (challengeErr) {
      setError(challengeErr.message);
      setLoading(false);
      return;
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });

    if (verifyErr) {
      setError(t("mfa.invalidCode"));
      setCode("");
      setLoading(false);
      inputRef.current?.focus();
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
          <ShieldCheck className="h-7 w-7 text-brand" />
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {t("mfa.verifyTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted">{t("mfa.verifySubtitle")}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div>
          <Label htmlFor="code">{t("mfa.codeLabel")}</Label>
          <Input
            ref={inputRef}
            id="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="h-12 text-center text-2xl tracking-[0.5em] font-mono"
          />
        </div>

        <Button
          type="submit"
          loading={loading}
          disabled={code.length !== 6}
          className="mt-2 w-full"
          size="lg"
        >
          {t("mfa.verify")}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>
    </>
  );
}

export default function MfaVerifyPage() {
  return (
    <AuthShell hideThemeSwitcher>
      <Suspense>
        <MfaVerifyForm />
      </Suspense>
    </AuthShell>
  );
}
