import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notifyClientUsers } from "@/lib/notify";

export const runtime = "nodejs";

const UNITS = ["currency", "number", "percent", "ratio", "rank"];
const MANUAL = "Manual";

/**
 * Replace a client's MANUAL KPIs (staff only). KPIs from connected sources are
 * owned by the sync and never touched here. The new set is inserted before the
 * old rows are removed, so a failed save can't leave the dashboard empty.
 */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const sb = createClient();
  if (!sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { clientId?: string; kpis?: any[] };
  if (!b.clientId || !Array.isArray(b.kpis)) {
    return NextResponse.json({ error: "clientId and kpis are required." }, { status: 400 });
  }
  if (b.kpis.length > 40) return NextResponse.json({ error: "Too many KPIs." }, { status: 400 });

  const rows = [];
  for (const k of b.kpis) {
    const label = String(k?.label ?? "").trim().slice(0, 80);
    if (!label) continue;
    const value = Number(k.value);
    if (k.value === "" || k.value == null || !Number.isFinite(value)) {
      return NextResponse.json({ error: `"${label}" needs a numeric value.` }, { status: 400 });
    }
    const delta = k.delta === "" || k.delta == null ? null : Number(k.delta);
    if (delta != null && !Number.isFinite(delta)) {
      return NextResponse.json({ error: `"${label}" has an invalid change value.` }, { status: 400 });
    }
    rows.push({
      client_id: b.clientId,
      metric_name: String(k.metric_name || label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "metric",
      label,
      value,
      unit: UNITS.includes(k.unit) ? k.unit : "number",
      delta,
      period: k.period ? String(k.period).slice(0, 40) : null,
      source: MANUAL,
    });
  }

  const { data: old, error: readErr } = await sb.from("kpis").select("id").eq("client_id", b.clientId).eq("source", MANUAL);
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 400 });

  if (rows.length) {
    let ins = await sb.from("kpis").insert(rows);
    // Pre-0027 schema: delta is NOT NULL — store "no change given" as 0 (the UI hides 0).
    if (ins.error?.code === "23502") ins = await sb.from("kpis").insert(rows.map((r) => ({ ...r, delta: r.delta ?? 0 })));
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
  }
  if (old?.length) {
    const { error: delErr } = await sb.from("kpis").delete().in("id", old.map((o: { id: string }) => o.id));
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  if (rows.length || old?.length) {
    await notifyClientUsers(b.clientId, {
      title: "Your dashboard was updated",
      body: "TyloTech refreshed your performance metrics.",
      href: "/dashboard",
      type: "update",
    });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
