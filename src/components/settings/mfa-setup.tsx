"use client";

import { AlertCircle, Check, Loader2, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/provider";

type MfaState = "loading" | "not-enrolled" | "enrolling" | "enrolled";

export function MfaSetup() {
  const t = useT();
  const [state, setState] = useState<MfaState>("loading");
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);

  const checkEnrollment = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;
    const { data } = await supabase.auth.mfa.listFactors();
    const totp = data?.totp?.find((f: { status: string }) => f.status === "verified");
    if (totp) {
      setFactorId(totp.id);
      setState("enrolled");
    } else {
      setState("not-enrolled");
    }
  }, []);

  useEffect(() => {
    checkEnrollment();
  }, [checkEnrollment]);

  async function startEnrollment() {
    setError(null);
    const supabase = createClient()!;
    const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator App",
    });
    if (enrollErr || !data) {
      setError(enrollErr?.message ?? "Enrollment failed");
      return;
    }
    setFactorId(data.id);
    setQrUri(data.totp.qr_code);
    setSecret(data.totp.secret);
    setState("enrolling");
  }

  async function verifyEnrollment(e: React.FormEvent) {
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
      return;
    }

    setState("enrolled");
    setQrUri(null);
    setSecret(null);
    setCode("");
    setLoading(false);
  }

  async function unenroll() {
    if (!factorId) return;
    setUnenrolling(true);
    setError(null);
    const supabase = createClient()!;
    const { error: unenrollErr } = await supabase.auth.mfa.unenroll({ factorId });
    if (unenrollErr) {
      setError(unenrollErr.message);
      setUnenrolling(false);
      return;
    }
    setFactorId(null);
    setState("not-enrolled");
    setUnenrolling(false);
  }

  if (state === "loading") {
    return (
      <Card className="p-6">
        <CardHeader>
          <CardTitle>{t("mfa.title")}</CardTitle>
        </CardHeader>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand" />
          {t("mfa.title")}
        </CardTitle>
      </CardHeader>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {state === "enrolled" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
            <Check className="h-5 w-5 text-success" />
            <div>
              <p className="text-sm font-semibold text-success">{t("mfa.enabled")}</p>
              <p className="text-xs text-muted">{t("mfa.enabledDesc")}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={unenroll}
              loading={unenrolling}
              className="text-danger hover:bg-danger/10 hover:text-danger"
            >
              <ShieldOff className="mr-1.5 h-4 w-4" />
              {t("mfa.disable")}
            </Button>
          </div>
        </div>
      )}

      {state === "not-enrolled" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t("mfa.setupDesc")}</p>
          <Button onClick={startEnrollment}>
            <Smartphone className="mr-1.5 h-4 w-4" />
            {t("mfa.setup")}
          </Button>
        </div>
      )}

      {state === "enrolling" && qrUri && (
        <div className="space-y-5">
          <p className="text-sm text-muted">{t("mfa.scanQr")}</p>

          <div className="flex justify-center">
            <div className="rounded-2xl border border-border bg-white p-3">
              {/* QR code is a data URI from Supabase */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUri}
                alt="TOTP QR Code"
                width={200}
                height={200}
                className="rounded-lg"
              />
            </div>
          </div>

          {secret && (
            <div className="rounded-xl border border-border bg-surface/50 px-4 py-3">
              <p className="mb-1 text-xs text-muted">{t("mfa.manualEntry")}</p>
              <code className="select-all break-all text-sm font-mono text-foreground">
                {secret}
              </code>
            </div>
          )}

          <form onSubmit={verifyEnrollment} className="space-y-3">
            <div>
              <Label htmlFor="mfa-code">{t("mfa.codeLabel")}</Label>
              <Input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="h-12 text-center text-xl tracking-[0.5em] font-mono"
              />
            </div>
            <Button
              type="submit"
              loading={loading}
              disabled={code.length !== 6}
              className="w-full"
            >
              {t("mfa.activateBtn")}
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}
