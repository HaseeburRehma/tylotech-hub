"use client";

import { AlertCircle, ArrowRight, CheckCircle2, KeyRound, Lock, Mail, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { AuthShell } from "@/components/auth/auth-shell";

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
    <AuthShell>
      {done ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="h-14 w-14 text-success" />
          <p className="text-lg font-semibold">Account created</p>
          <p className="text-sm text-muted">Taking you to sign in…</p>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <h1 className="font-display text-3xl font-semibold tracking-tight">Create your account</h1>
            <p className="mt-2 text-sm text-muted">Register a new TyloTech team member.</p>
          </div>

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
                <Input id="name" required value={form.name} onChange={set("name")} placeholder="Jane Doe" className="h-12 pl-10" />
              </div>
            </div>
            <div>
              <Label htmlFor="email">Work email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input id="email" type="email" required value={form.email} onChange={set("email")} placeholder="you@tylotech.de" className="h-12 pl-10" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input id="password" type="password" required minLength={8} value={form.password} onChange={set("password")} placeholder="8+ characters" className="h-12 pl-10" />
                </div>
              </div>
              <div>
                <Label htmlFor="code">Invite code</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input id="code" required value={form.code} onChange={set("code")} placeholder="Team code" className="h-12 pl-10" />
                </div>
              </div>
            </div>

            <Button type="submit" loading={loading} className="mt-2 w-full" size="lg">
              Create account
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-brand hover:underline">
              Sign in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
