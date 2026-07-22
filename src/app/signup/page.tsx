"use client";

import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, CheckCircle2, KeyRound, Lock, Mail, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", code: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create account.");
        setLoading(false);
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 1600);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/4 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-brand/[0.12] blur-[140px]" />
        <div className="absolute inset-0 bg-grid bg-[size:48px_48px] opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      </div>

      <div className="absolute right-5 top-5">
        <ThemeSwitcher />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={48} showName={false} />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Create your team account</h1>
          <p className="mt-1.5 text-sm text-muted">Register a new TyloTech team member</p>
        </div>

        <div className="card p-7 shadow-float">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="font-medium">Account created</p>
              <p className="text-sm text-muted">Taking you to sign in…</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div>
                <Label htmlFor="name">Full name</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input id="name" required value={form.name} onChange={set("name")} placeholder="Jane Doe" className="pl-10" />
                </div>
              </div>
              <div>
                <Label htmlFor="email">Work email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input id="email" type="email" required value={form.email} onChange={set("email")} placeholder="you@tylotech.de" className="pl-10" />
                </div>
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input id="password" type="password" required minLength={8} value={form.password} onChange={set("password")} placeholder="At least 8 characters" className="pl-10" />
                </div>
              </div>
              <div>
                <Label htmlFor="code">Team invite code</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input id="code" required value={form.code} onChange={set("code")} placeholder="Provided by your admin" className="pl-10" />
                </div>
              </div>

              <Button type="submit" loading={loading} className="w-full" size="lg">
                Create account
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
