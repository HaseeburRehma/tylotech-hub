"use client";

import { Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal";
import { useT } from "@/lib/i18n/provider";
import type { Client, Plan } from "@/types";

const PLANS: Plan[] = ["Starter", "Growth", "Scale", "Enterprise"];
const HEX_RE = /^#[0-9a-f]{6}$/i;

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={HEX_RE.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-11 w-11 shrink-0 cursor-pointer rounded-xl border border-border bg-surface p-1"
        />
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} className="font-mono" />
      </div>
    </div>
  );
}

export function EditClientModal({ open, onClose, client }: { open: boolean; onClose: () => void; client: Client }) {
  const t = useT();
  const router = useRouter();
  const [company, setCompany] = useState(client.company);
  const [contact, setContact] = useState(client.name ?? "");
  const [plan, setPlan] = useState<Plan>(client.plan);
  const [mrr, setMrr] = useState(String(client.mrr ?? 0));
  const [primary, setPrimary] = useState(client.primary_color ?? "#C9A84C");
  const [secondary, setSecondary] = useState(client.secondary_color ?? "#0A0A0A");
  const [logoUrl, setLogoUrl] = useState(client.logo_url ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form from the latest record every time it opens.
  useEffect(() => {
    if (!open) return;
    setCompany(client.company);
    setContact(client.name ?? "");
    setPlan(client.plan);
    setMrr(String(client.mrr ?? 0));
    setPrimary(client.primary_color ?? "#C9A84C");
    setSecondary(client.secondary_color ?? "#0A0A0A");
    setLogoUrl(client.logo_url ?? "");
    setError(null);
  }, [open, client]);

  async function save() {
    if (!company.trim()) return setError(t("editClient.companyRequired"));
    if (!HEX_RE.test(primary) || !HEX_RE.test(secondary)) return setError(t("editClient.colorInvalid"));
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          name: contact,
          plan,
          mrr: Number(mrr.replace(/[^\d.]/g, "")) || 0,
          primaryColor: primary,
          secondaryColor: secondary,
          logoUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? t("editClient.failed"));
      onClose();
      router.refresh();
    } catch {
      setError(t("editClient.failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand">
            <Pencil className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold">{t("editClient.title")}</h2>
            <p className="text-sm text-muted">{t("editClient.subtitle")}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form
        className="space-y-4 px-6 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ec-company">{t("cd.company")}</Label>
            <Input id="ec-company" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} required />
          </div>
          <div>
            <Label htmlFor="ec-contact">{t("cd.contact")}</Label>
            <Input id="ec-contact" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label htmlFor="ec-plan">{t("cd.planLabel")}</Label>
            <select
              id="ec-plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value as Plan)}
              className="input-base appearance-none"
            >
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ec-mrr">{t("cd.mrr")} (€)</Label>
            <Input id="ec-mrr" inputMode="numeric" value={mrr} onChange={(e) => setMrr(e.target.value)} />
          </div>
          <ColorField id="ec-primary" label={t("editClient.primary")} value={primary} onChange={setPrimary} />
          <ColorField id="ec-secondary" label={t("editClient.secondary")} value={secondary} onChange={setSecondary} />
        </div>
        <div>
          <Label htmlFor="ec-logo">{t("editClient.logoUrl")}</Label>
          <Input
            id="ec-logo"
            type="url"
            placeholder="https://…"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
        </div>

        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="-mx-6 mt-2 flex items-center justify-end gap-3 border-t border-border px-6 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
          >
            {t("common.cancel")}
          </button>
          <Button type="submit" loading={saving}>
            {t("editClient.save")}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}
