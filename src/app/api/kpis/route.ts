import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notifyClientUsers } from "@/lib/notify";

export const runtime = "nodejs";

const UNITS = ["currency", "number", "percent", "ratio", "rank"];

/** Replace the full KPI set for a client (staff only). */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const sb = createClient();
  if (!sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { clientId?: string; kpis?: any[] };
  if (!b.clientId || !Array.isArray(b.kpis)) {
    return NextResponse.json({ error: "clientId and kpis are required." }, { status: 400 });
  }

  const rows = b.kpis
    .filter((k) => k?.label && k?.metric_name)
    .map((k) => ({
      client_id: b.clientId,
      metric_name: String(k.metric_name),
      label: String(k.label),
      value: Number(k.value) || 0,
      unit: UNITS.includes(k.unit) ? k.unit : "number",
      delta: Number(k.delta) || 0,
      period: k.period ? String(k.period) : null,
      source: k.source ? String(k.source) : "Manual",
    }));

  await sb.from("kpis").delete().eq("client_id", b.clientId);
  if (rows.length) {
    const { error } = await sb.from("kpis").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await notifyClientUsers(b.clientId, {
    title: "Your dashboard was updated",
    body: "TyloTech refreshed your performance metrics.",
    href: "/dashboard",
    type: "update",
  });

  return NextResponse.json({ ok: true, count: rows.length });
}
