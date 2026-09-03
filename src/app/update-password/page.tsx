"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/auth/password-input";
import { Logo } from "@/components/ui/logo";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Password must be at least 8 characters.");
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/4 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-brand/[0.12] blur-[140px]" />
      </div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={44} showName={false} />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Set a new password</h1>
        </div>
        <div className="card p-7 shadow-float">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="font-medium">Password updated</p>
              <p className="text-sm text-muted">Signing you in…</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {error && <p className="text-sm text-danger">{error}</p>}
              <div>
                <Label htmlFor="pw">New password</Label>
                <PasswordInput id="pw" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
              </div>
              <div>
                <Label htmlFor="pw2">Confirm password</Label>
                <PasswordInput id="pw2" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Re-enter password" />
              </div>
              <Button type="submit" loading={loading} className="w-full" size="lg">Update password</Button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
