"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/client";

function Status({ state }: { state: "idle" | "saving" | "saved" | "error"; }) {
  if (state === "saving") return <Loader2 className="h-4 w-4 animate-spin text-muted" />;
  if (state === "saved") return <span className="inline-flex items-center gap-1 text-xs text-success"><Check className="h-3.5 w-3.5" /> Saved</span>;
  return null;
}

export function SettingsView({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(name);
  const [profileState, setProfileState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [profileError, setProfileError] = useState<string | null>(null);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwState, setPwState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pwError, setPwError] = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileState("saving");
    setProfileError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: displayName }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setProfileError(d.error ?? "Could not save.");
      setProfileState("error");
      return;
    }
    setProfileState("saved");
    router.refresh();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (pw.length < 8) return setPwError("Password must be at least 8 characters.");
    if (pw !== pw2) return setPwError("Passwords don't match.");
    const supabase = createClient();
    if (!supabase) return setPwError("Backend not configured.");
    setPwState("saving");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setPwError(error.message);
      setPwState("error");
      return;
    }
    setPw("");
    setPw2("");
    setPwState("saved");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Manage your profile and security." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <Status state={profileState} />
          </CardHeader>
          <form onSubmit={saveProfile} className="space-y-4">
            {profileError && <p className="text-sm text-danger">{profileError}</p>}
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled className="opacity-60" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={profileState === "saving"}>Save changes</Button>
            </div>
          </form>
        </Card>

        <Card className="p-6">
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <Status state={pwState} />
          </CardHeader>
          <form onSubmit={changePassword} className="space-y-4">
            {pwError && <p className="text-sm text-danger">{pwError}</p>}
            <div>
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div>
              <Label htmlFor="pw2">Confirm password</Label>
              <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={pwState === "saving"}>Update password</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
