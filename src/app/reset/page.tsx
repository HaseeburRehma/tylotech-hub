"use client";

import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { createClient } from "@/lib/supabase/client";

export default function ResetPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    if (!supabase) {
      setError("Backend not configured.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
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
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Reset your password</h1>
          <p className="mt-1.5 text-sm text-muted">We&apos;ll email you a secure reset link.</p>
        </div>
        <div className="card p-7 shadow-float">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="font-medium">Check your inbox</p>
              <p className="text-sm text-muted">If an account exists for {email}, a reset link is on its way.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {error && <p className="text-sm text-danger">{error}</p>}
              <div>
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="pl-10" />
                </div>
              </div>
              <Button type="submit" loading={loading} className="w-full" size="lg">Send reset link</Button>
            </form>
          )}
        </div>
        <Link href="/login" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>
      </motion.div>
    </div>
  );
}
