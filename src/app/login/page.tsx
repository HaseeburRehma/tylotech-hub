"use client";

import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Demo mode (no backend) — just enter the portal.
    if (!isSupabaseConfigured) {
      setTimeout(() => router.push(redirectTo), 600);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-md"
    >
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size={48} showName={false} />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted">Sign in to your client portal</p>
      </div>

      <div className="card p-7 shadow-float">
        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="pl-10"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/reset" className="mb-1.5 text-xs text-brand hover:underline">
                Forgot?
              </Link>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-10"
              />
            </div>
          </div>

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Sign in
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        TyloTech team member?{" "}
        <Link href="/signup" className="font-semibold text-brand hover:underline">
          Create an account
        </Link>
      </p>

      <p className="mt-6 text-center text-xs text-muted/70">
        Powered by <span className="font-semibold text-muted">TyloTech</span>
      </p>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/4 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-brand/[0.12] blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgb(var(--brand)/0.08),transparent_60%)]" />
        <div className="absolute inset-0 bg-grid bg-[size:48px_48px] opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      </div>

      <div className="absolute right-5 top-5">
        <ThemeSwitcher />
      </div>

      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
