"use client";

import { AlertCircle, ArrowLeft, CheckCircle2, IdCard, Lock, Mail, Shield, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";

export default function NewTeamMemberPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", title: "", password: "", role: "team" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    if (!res?.ok) {
      setError(data?.error ?? "Could not create the team member.");
      setLoading(false);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/internal"), 1400);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href="/internal" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Internal Hub
      </Link>
      <PageHeader title="New team member" subtitle="Add a TyloTech team member — they can log in and chat with clients right away." />

      <Card className="p-6">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <p className="text-lg font-semibold">Team member added</p>
            <p className="text-sm text-muted">Returning to the hub…</p>
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
                <Input id="name" required value={form.name} onChange={set("name")} placeholder="e.g. Haseeb ur Rehman" className="h-11 pl-10" />
              </div>
            </div>
            <div>
              <Label htmlFor="title">Title (shown to clients)</Label>
              <div className="relative">
                <IdCard className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input id="title" value={form.title} onChange={set("title")} placeholder="e.g. Head of Support" className="h-11 pl-10" />
              </div>
            </div>
            <div>
              <Label htmlFor="email">Work email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input id="email" type="email" required value={form.email} onChange={set("email")} placeholder="name@tylotech.de" className="h-11 pl-10" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <Input id="password" type="password" required minLength={8} value={form.password} onChange={set("password")} placeholder="8+ characters" className="h-11 pl-10" />
                </div>
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                <div className="relative">
                  <Shield className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <select
                    id="role"
                    value={form.role}
                    onChange={set("role")}
                    className="h-11 w-full rounded-xl border border-border bg-bg/60 pl-10 pr-3 text-sm outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15"
                  >
                    <option value="team">Team</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
            </div>
            <Button type="submit" loading={loading} className="mt-2 w-full" size="lg">
              Create team member
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
