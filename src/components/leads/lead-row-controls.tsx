"use client";

import { ChevronDown, MessageCircle, Phone, UserX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useT } from "@/lib/i18n/provider";
import { LEAD_STATUSES, dialable, type Lead, type LeadPerson, type LeadStatus } from "@/lib/leads-shared";
import { cn } from "@/lib/utils";
import { STATUS_VARIANT } from "./lead-bits";

async function patchLead(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = res ? ((await res.json().catch(() => ({}))) as { lead?: Lead; error?: string }) : {};
  return { ok: !!res?.ok, lead: data.lead, error: data.error ?? null };
}

// Controls inside a clickable row must not open the lead.
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Status as a badge that opens a menu of all statuses (optimistic, reverts on error). */
export function StatusMenu({ lead, onChange, onError }: { lead: Lead; onChange: (l: Lead) => void; onError: (msg: string) => void }) {
  const t = useT();
  async function pick(s: LeadStatus) {
    if (s === lead.status) return;
    const before = lead;
    onChange({ ...lead, status: s });
    const r = await patchLead(lead.id, { status: s });
    if (!r.ok) {
      onChange(before);
      onError(r.error ?? t("ait.actionFailed"));
    } else if (r.lead) onChange(r.lead);
  }
  return (
    <span onClick={stop} onKeyDown={stop} className="inline-flex">
      <Menu
        width={210}
        trigger={({ open, toggle }) => (
          <button type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={t("leads.row.changeStatus")} className="group inline-flex items-center gap-0.5 rounded-full outline-none field-focus">
            <Badge variant={STATUS_VARIANT[lead.status]}>{t(`leads.status.${lead.status}`)}</Badge>
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted opacity-0 transition group-hover:opacity-100", open && "rotate-180 opacity-100")} />
          </button>
        )}
      >
        {(close) =>
          LEAD_STATUSES.map((s) => (
            <MenuItem
              key={s}
              selected={s === lead.status}
              onSelect={() => {
                close();
                void pick(s);
              }}
            >
              <Badge variant={STATUS_VARIANT[s]}>{t(`leads.status.${s}`)}</Badge>
            </MenuItem>
          ))
        }
      </Menu>
    </span>
  );
}

/** Owner as avatar + first name; menu of the partner's people and the team. */
export function OwnerMenu({ lead, people, onChange, onError }: { lead: Lead; people: LeadPerson[]; onChange: (l: Lead) => void; onError: (msg: string) => void }) {
  const t = useT();
  const owner = people.find((p) => p.id === lead.assigned_to) ?? null;
  async function pick(id: string | null) {
    if (id === lead.assigned_to) return;
    const before = lead;
    onChange({ ...lead, assigned_to: id });
    const r = await patchLead(lead.id, { assignedTo: id });
    if (!r.ok) {
      onChange(before);
      onError(r.error ?? t("ait.actionFailed"));
    } else if (r.lead) onChange(r.lead);
  }
  return (
    <span onClick={stop} onKeyDown={stop} className="inline-flex min-w-0">
      <Menu
        width={240}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={t("leads.row.assign")}
            className="group inline-flex min-w-0 items-center gap-1.5 rounded-lg px-1 py-0.5 outline-none transition-colors field-focus hover:bg-surface-2"
          >
            {owner ? (
              <>
                <Avatar name={owner.name} size={22} />
                <span className="truncate text-xs text-foreground">{owner.name.split(" ")[0]}</span>
              </>
            ) : (
              <span className="text-xs text-muted/70">{t("leads.unassigned")}</span>
            )}
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition group-hover:opacity-100", open && "rotate-180 opacity-100")} />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem
              icon={<UserX className="h-4 w-4" />}
              selected={!lead.assigned_to}
              onSelect={() => {
                close();
                void pick(null);
              }}
            >
              {t("leads.unassigned")}
            </MenuItem>
            {people.map((p) => (
              <MenuItem
                key={p.id}
                icon={<Avatar name={p.name} size={18} />}
                selected={p.id === lead.assigned_to}
                onSelect={() => {
                  close();
                  void pick(p.id);
                }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">{p.name}</span>
                  {p.role !== "client" && <span className="shrink-0 text-caption text-muted">TyloTech</span>}
                </span>
              </MenuItem>
            ))}
          </>
        )}
      </Menu>
    </span>
  );
}

/**
 * WhatsApp and call buttons. Opening one logs a contact attempt on the lead
 * (a new lead becomes "contacted"), the same as from the lead drawer.
 */
export function ContactButtons({ lead, onChange }: { lead: Lead; onChange: (l: Lead) => void }) {
  const t = useT();
  if (!lead.phone) return null;
  const log = (body: string) => {
    void fetch(`/api/leads/${lead.id}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "call", body }) })
      .then((r) => {
        if (r.ok && lead.status === "new") onChange({ ...lead, status: "contacted" });
      })
      .catch(() => {});
  };
  const btn = "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors outline-none field-focus";
  return (
    <span onClick={stop} onKeyDown={stop} className="inline-flex items-center gap-1">
      <a
        href={`https://wa.me/${dialable(lead.phone, true)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => log("WhatsApp")}
        aria-label={`${t("leads.row.whatsapp")}: ${lead.phone}`}
        title={t("leads.row.whatsapp")}
        className={cn(btn, "bg-[#25D366]/12 text-[#1da851] hover:bg-[#25D366]/25")}
      >
        <MessageCircle className="h-4 w-4" />
      </a>
      <a
        href={`tel:${dialable(lead.phone)}`}
        onClick={() => log(t("leads.row.call"))}
        aria-label={`${t("leads.row.call")}: ${lead.phone}`}
        title={t("leads.row.call")}
        className={cn(btn, "bg-surface-2 text-muted hover:text-foreground")}
      >
        <Phone className="h-3.5 w-3.5" />
      </a>
    </span>
  );
}
