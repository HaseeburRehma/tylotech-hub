import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser } from "@/lib/auth";
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
    loginCustomerId?: string;
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

  // integrations SELECT/UPDATE/INSERT are revoked from the browser role, so every
  // branch below needs the service-role client — not the RLS-scoped `supabase`.
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const staff = user.role !== "client";

  if (action === "disconnect") {
    const { data: existing } = await admin
      .from("integrations")
      .select("meta")
      .eq("client_id", clientId)
      .eq("provider", provider.id)
      .maybeSingle();
    const { tokenOwner, ...meta } = (existing?.meta ?? {}) as Record<string, unknown>;
    // A connection your agency set up is theirs to remove (same rule as "configure").
    if (!staff && tokenOwner && tokenOwner !== "client") {
      return NextResponse.json({ error: "This connection is managed by your TyloTech team." }, { status: 403 });
    }
    // Drop credentials so a later "connect" can't silently revive them.
    const { error } = await admin
      .from("integrations")
      .update({ status: "disconnected", access_token: null, refresh_token: null, meta })
      .eq("client_id", clientId)
      .eq("provider", provider.id);
    if (error) {
      console.error("integration disconnect failed:", error.message);
      return NextResponse.json({ error: "Could not disconnect." }, { status: 400 });
    }
    await logAudit(user, { action: "integration.disconnect", clientId, targetType: "integration", targetId: provider.id }, admin);
    return NextResponse.json({ ok: true, status: "disconnected" });
  }

  if (action === "configure") {
    // Store account/site/property (merged into meta) and, optionally, a pasted API
    // access token. Only staff may set the token.
    const { data: existing } = await admin
      .from("integrations")
      .select("meta")
      .eq("client_id", clientId)
      .eq("provider", provider.id)
      .maybeSingle();

    const meta: Record<string, unknown> = { ...(existing?.meta ?? {}) };
    const changesTarget = body.accountId !== undefined || body.siteUrl !== undefined || body.propertyId !== undefined || body.loginCustomerId !== undefined;
    // A client may only re-target a token they authorised themselves; a staff or
    // agency token pointed at another account would leak that account's data.
    if (changesTarget && !staff && meta.tokenOwner !== "client") {
      return NextResponse.json({ error: "Only your TyloTech team can change this connection." }, { status: 403 });
    }
    if (body.accessToken !== undefined && !staff) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const update: Record<string, unknown> = {};
    if (changesTarget) {
      for (const key of ["accountId", "siteUrl", "propertyId", "loginCustomerId"] as const) {
        const v = body[key];
        if (v === undefined) continue;
        const clean = String(v).trim().slice(0, 200);
        if (clean && !/^[\w:/.\-?=&%#@+ ]+$/.test(clean)) {
          return NextResponse.json({ error: "Invalid identifier." }, { status: 400 });
        }
        // Per-provider shapes — catches pasted emails, autofill and typos early.
        const shape: Record<string, RegExp> = {
          "meta_ads:accountId": /^(act_)?\d{5,20}$/,
          "google_ads:accountId": /^\d{3}-?\d{3}-?\d{4}$/,
          // Manager account (MCC) the ad account is reached through; empty = detect automatically.
          "google_ads:loginCustomerId": /^\d{3}-?\d{3}-?\d{4}$/,
          "ga4:propertyId": /^(properties\/)?\d{5,15}$/,
          "search_console:siteUrl": /^(https?:\/\/\S+|sc-domain:\S+)$/,
        };
        const re = shape[`${provider.id}:${key}`];
        if (clean && re && !re.test(clean)) {
          return NextResponse.json({ error: `Invalid ${key} for ${provider.id}.` }, { status: 400 });
        }
        if (key === "loginCustomerId") {
          if (provider.id !== "google_ads") continue;
          // Cleared → the next sync looks the manager up again.
          if (clean) meta.loginCustomerId = clean;
          else delete meta.loginCustomerId;
          delete meta.managerLookupError;
          continue;
        }
        meta[key] = clean;
      }
    }
    if (body.accessToken !== undefined) {
      const tok = body.accessToken.trim();
      // Real API tokens are long and have no spaces or "@" — refuse anything that
      // looks like a password or email (e.g. browser autofill).
      if (tok && (tok.length < 40 || /[\s@]/.test(tok))) {
        return NextResponse.json({ error: "That doesn't look like an API access token." }, { status: 400 });
      }
      update.access_token = tok || null;
      meta.tokenOwner = "staff";
    }
    if (!Object.keys(update).length && !changesTarget) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
    update.meta = meta;
    const { error } = await admin
      .from("integrations")
      .update(update)
      .eq("client_id", clientId)
      .eq("provider", provider.id);
    if (error) {
      console.error("integrations request failed:", error.message);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action !== "connect") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  // Manual connect (no OAuth) only creates a slot for staff to paste a token into;
  // clients must go through the provider's OAuth flow.
  if (!staff) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const live = isProviderLive(provider);
  const { error } = await admin
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

  if (error) {

    console.error("integrations request failed:", error.message);

    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 400 });

  }
  return NextResponse.json({ ok: true, live });
}
