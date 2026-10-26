"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Lead } from "@/lib/leads-shared";
import { shouldAlert } from "@/lib/speed-to-lead";
import type { Role } from "@/types";
import { LeadAlertCard } from "./lead-alert-card";

/**
 * Portal-wide Speed-to-Lead alerts: listens for new leads over Realtime and pops
 * the full-screen countdown card anywhere in the app. Strict tenant isolation —
 * RLS scopes a partner's channel to their own leads; staff see every tenant.
 * The card for a lead disappears on every device within ~1s once someone else
 * claims it or moves it on.
 */
export function SpeedToLeadProvider({
  userId,
  role,
  clientId,
  tenantNames,
}: {
  userId: string;
  role: Role;
  clientId: string | null;
  /** id → company, for the staff who serve several partners. */
  tenantNames?: Record<string, string>;
}) {
  const [queue, setQueue] = useState<Lead[]>([]);
  const offsetRef = useRef(0);
  const staff = role === "admin" || role === "team";

  // Measure the server-clock offset once (round-trip corrected) so a wrong
  // device clock can't shorten or extend the 60s.
  useEffect(() => {
    let alive = true;
    const t0 = Date.now();
    fetch("/api/time")
      .then((r) => r.json())
      .then(({ now }) => {
        if (!alive || typeof now !== "number") return;
        offsetRef.current = now + (Date.now() - t0) / 2 - Date.now();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const sb = createClient();
    if (!sb || (!staff && !clientId)) return;
    const scope = staff ? {} : { filter: `client_id=eq.${clientId}` };

    const ch = sb
      .channel(`s2l:${staff ? "staff" : clientId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads", ...scope }, (p) => {
        const lead = p.new as Lead;
        if (!shouldAlert(lead, Date.now() + offsetRef.current)) return;
        setQueue((q) => (q.some((l) => l.id === lead.id) ? q : [...q, lead]));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads", ...scope }, (p) => {
        const lead = p.new as Lead;
        // Taken or moved on by someone else → pull it from this device. My own
        // claim keeps the card (I'm working it; it closes itself on outcome).
        const byOther = lead.claimed_by !== userId;
        if (byOther && (lead.claimed_at || lead.status !== "new")) {
          setQueue((q) => q.filter((l) => l.id !== lead.id));
        }
      })
      .subscribe();

    return () => {
      sb.removeChannel(ch);
    };
  }, [staff, clientId, userId]);

  const current = queue[0];
  if (!current) return null;

  return (
    <LeadAlertCard
      key={current.id}
      lead={current}
      serverOffsetMs={offsetRef.current}
      tenantName={staff ? tenantNames?.[current.client_id] : undefined}
      onClose={() => setQueue((q) => q.filter((l) => l.id !== current.id))}
    />
  );
}
