import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!isStaff(user)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Backend not configured." }, { status: 503 });
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const company = body.company?.trim();
  if (!company) {
    return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  }

  // Clean, unique slug for the client's URL (/internal/clients/<slug>).
  const base = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "client";
  let slug = base;
  const { data: taken } = await admin.from("clients").select("slug").eq("slug", base).maybeSingle();
  if (taken) slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;

  const { data: client, error } = await admin
    .from("clients")
    .insert({
      name: company,
      company,
      slug,
      primary_color: body.primaryColor || "#C9A84C",
      secondary_color: body.secondaryColor || "#0A0A0A",
      plan: body.plan || "Starter",
      mrr: Number(body.mrr) || 0,
      logo_url: body.logoUrl || null,
    })
    .select("id")
    .single();

  if (error || !client) {
    return NextResponse.json({ error: error?.message ?? "Could not create client." }, { status: 400 });
  }

  // Optionally provision the client's first login.
  let clientUser: string | null = null;
  let warning: string | undefined;
  const email = body.clientEmail?.trim().toLowerCase();
  if (email && body.clientPassword) {
    const { data: created, error: uErr } = await admin.auth.admin.createUser({
      email,
      password: body.clientPassword,
      email_confirm: true,
      user_metadata: { name: body.clientName || company, role: "client" },
    });
    if (uErr || !created.user) {
      warning = `Client created, but the login could not be: ${uErr?.message}`;
    } else {
      const { error: pErr } = await admin.from("users").insert({
        id: created.user.id,
        email,
        name: body.clientName || company,
        role: "client",
        client_id: client.id,
      });
      if (pErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        warning = `Client created, but the login could not be: ${pErr.message}`;
      } else {
        clientUser = email;
      }
    }
  }

  return NextResponse.json({ ok: true, clientId: client.id, clientUser, warning });
}
