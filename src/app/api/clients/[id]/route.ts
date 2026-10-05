import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const PLANS = new Set(["Starter", "Growth", "Scale", "Enterprise"]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "Invalid client id." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const patch: Record<string, unknown> = {};

  if (b.archived !== undefined) {
    if (user?.role !== "admin") return NextResponse.json({ error: "Only admins can archive clients." }, { status: 403 });
    patch.archived_at = b.archived ? new Date().toISOString() : null;
  }

  if (b.company !== undefined) {
    const company = String(b.company).trim();
    if (!company || company.length > 120) {
      return NextResponse.json({ error: "Company name must be 1–120 characters." }, { status: 400 });
    }
    patch.company = company;
  }
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (name.length > 120) return NextResponse.json({ error: "Contact name is too long." }, { status: 400 });
    patch.name = name || patch.company || null;
  }
  if (b.plan !== undefined) {
    if (!PLANS.has(String(b.plan))) return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
    patch.plan = b.plan;
  }
  if (b.mrr !== undefined) {
    const mrr = Number(b.mrr);
    if (!Number.isFinite(mrr) || mrr < 0 || mrr > 10_000_000) {
      return NextResponse.json({ error: "MRR must be a positive number." }, { status: 400 });
    }
    patch.mrr = Math.round(mrr);
  }
  for (const [key, col] of [
    ["primaryColor", "primary_color"],
    ["secondaryColor", "secondary_color"],
  ] as const) {
    if (b[key] === undefined) continue;
    if (!HEX_RE.test(String(b[key]))) return NextResponse.json({ error: "Colors must be #RRGGBB." }, { status: 400 });
    patch[col] = String(b[key]).toUpperCase();
  }
  if (b.logoUrl !== undefined) {
    const url = String(b.logoUrl).trim();
    if (url && !/^https:\/\/[^\s]+$/i.test(url)) {
      return NextResponse.json({ error: "Logo URL must start with https://" }, { status: 400 });
    }
    patch.logo_url = url || null;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { data: before } = await admin.from("clients").select("mrr").eq("id", params.id).maybeSingle();
  const { data, error } = await admin.from("clients").update(patch).eq("id", params.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  // Record MRR changes so the revenue history stays truthful (best-effort pre-0028).
  if (patch.mrr !== undefined && Number(before?.mrr ?? 0) !== patch.mrr) {
    await admin.from("client_mrr_history").insert({ client_id: params.id, mrr: patch.mrr });
  }
  return NextResponse.json({ ok: true });
}
