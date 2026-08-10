import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider, isProviderLive } from "@/lib/integrations/providers";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { provider: string } },
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const provider = getProvider(params.provider);
  if (!provider) return NextResponse.json({ error: "Unknown provider." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    clientId?: string;
    accountId?: string;
    siteUrl?: string;
    propertyId?: string;
    accessToken?: string;
  };
  const action = body.action;

  // Clients act on their own tenant; staff can target any client.
  const clientId = user.role === "client" ? user.client_id : body.clientId;
  if (!clientId) return NextResponse.json({ error: "Missing client." }, { status: 400 });
  if (user.role === "client" && clientId !== user.client_id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  if (action === "disconnect") {
    const { error } = await supabase
      .from("integrations")
      .update({ status: "disconnected" })
      .eq("client_id", clientId)
      .eq("provider", provider.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, status: "disconnected" });
  }

  if (action === "configure") {
    // Store account/site/property (merged into meta) and, optionally, a pasted API
    // access token. Only staff may set the token. Uses the service role because
    // integrations SELECT is revoked from the browser role (needed to merge meta).
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

    const { data: existing } = await admin
      .from("integrations")
      .select("meta")
      .eq("client_id", clientId)
      .eq("provider", provider.id)
      .maybeSingle();

    const update: Record<string, unknown> = {};
    if (body.accountId !== undefined || body.siteUrl !== undefined || body.propertyId !== undefined) {
      const meta: Record<string, string> = { ...(existing?.meta ?? {}) };
      if (body.accountId !== undefined) meta.accountId = body.accountId.trim();
      if (body.siteUrl !== undefined) meta.siteUrl = body.siteUrl.trim();
      if (body.propertyId !== undefined) meta.propertyId = body.propertyId.trim();
      update.meta = meta;
    }
    if (body.accessToken !== undefined && user.role !== "client") {
      update.access_token = body.accessToken.trim() || null;
    }
    const { error } = await admin
      .from("integrations")
      .update(update)
      .eq("client_id", clientId)
      .eq("provider", provider.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // connect — real OAuth would happen here when credentials are configured.
  // No .select() back: integrations SELECT is revoked from the browser role, and
  // the board refreshes from the (service-role) server page after this returns.
  const live = isProviderLive(provider);
  const { error } = await supabase
    .from("integrations")
    .upsert(
      {
        client_id: clientId,
        provider: provider.id,
        status: "connected",
        account_label: live ? `${provider.name} (live)` : `${provider.name} · Sandbox`,
      },
      { onConflict: "client_id,provider" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, live });
}
