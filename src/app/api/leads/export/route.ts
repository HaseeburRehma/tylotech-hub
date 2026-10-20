import { NextResponse } from "next/server";
import { leadsContext } from "@/lib/leads";

export const runtime = "nodejs";

const csv = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas; quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** All leads of a partner as CSV (Excel-friendly, UTF-8 with BOM). Team: ?clientId=. */
export async function GET(req: Request) {
  const ctx = await leadsContext(new URL(req.url).searchParams.get("clientId"));
  if ("error" in ctx) return ctx.error;
  const [{ data: leads }, { data: users }] = await Promise.all([
    ctx.admin.from("leads").select("*").eq("client_id", ctx.clientId).order("lead_no"),
    ctx.admin.from("users").select("id,name"),
  ]);
  const nameOf = new Map((users ?? []).map((u) => [u.id, u.name]));
  const header = ["Nr", "Eingang", "Quelle", "Kampagne", "Formular", "Name", "E-Mail", "Telefon", "Status", "Zuständig", "Termin", "Wert", "Alle Angaben"];
  const rows = (leads ?? []).map((l) =>
    [
      l.lead_no,
      new Date(l.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
      l.source,
      l.campaign,
      l.form,
      l.name,
      l.email,
      l.phone,
      l.status,
      l.assigned_to ? nameOf.get(l.assigned_to) ?? "" : "",
      l.appointment_at ? new Date(l.appointment_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "",
      l.value ?? "",
      ((l.fields ?? []) as { label: string; value: string }[]).map((f) => `${f.label}: ${f.value}`).join(" | "),
    ]
      .map(csv)
      .join(";"),
  );
  const body = "﻿" + [header.map(csv).join(";"), ...rows].join("\r\n");
  return new NextResponse(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
