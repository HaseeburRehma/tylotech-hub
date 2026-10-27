import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { META_GRAPH_VERSION } from "@/lib/integrations/fetchers";
import { oauthConfig } from "@/lib/integrations/oauth";
import { exchangeMetaCode, listMetaPages, META_PICK_COOKIE, META_PICK_TTL_SEC, sealMetaPick } from "@/lib/leads-meta";
import { SHEETS_SCOPE, SheetError, sheetMeta, type SheetConfig } from "@/lib/leads-sheets";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

const NONCE_COOKIE = "oauth_nonce";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  // Land back on the partner that was being connected (by slug), never on
  // whichever partner happened to be active — otherwise a successful connect
  // shows another partner's card and looks like it failed. The id from `state`
  // is only used to pick the page here; every access check below still applies.
  let backTo = "";
  let peekProvider = "";
  try {
    const peek = JSON.parse(Buffer.from(url.searchParams.get("state") ?? "", "base64url").toString()) as { clientId?: string; provider?: string };
    peekProvider = peek.provider ?? "";
    if (peek.clientId && /^[0-9a-f-]{36}$/i.test(peek.clientId)) {
      const admin0 = createAdminClient();
      const { data: c } = admin0 ? await admin0.from("clients").select("slug").eq("id", peek.clientId).maybeSingle() : { data: null };
      if (c?.slug) backTo = `client=${encodeURIComponent(c.slug)}&`;
    }
  } catch {
    /* no/invalid state — fall back to the plain page */
  }
  const done = (params: string) => NextResponse.redirect(`${origin}/integrations?${backTo}${params}`);

  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // Provider error codes are echoed back to /integrations — keep them a single, encoded parameter.
  const providerError = url.searchParams.get("error");
  // A cancelled Meta Lead Ads dialog goes back to Leads, where it was started.
  if (providerError && peekProvider === "meta_leads") return NextResponse.redirect(`${origin}/leads?${backTo}meta=denied`);
  if (providerError && peekProvider === "google_sheet") return NextResponse.redirect(`${origin}/leads?${backTo}sheet=denied`);
  if (providerError) return done(`error=${encodeURIComponent(providerError.slice(0, 40))}`);
  if (!code || !state) return done("error=oauth_failed");

  let provider = "", clientId = "", nonce = "";
  try {
    ({ provider, clientId, nonce } = JSON.parse(Buffer.from(state, "base64url").toString()));
  } catch {
    return done("error=bad_state");
  }

  // `state` is otherwise attacker-constructible base64 JSON — require it to
  // carry the exact nonce this server issued to THIS browser at /oauth/start,
  // so a forged callback link (attacker's own code + a hand-picked clientId)
  // can't be replayed under someone else's authenticated session.
  const cookieStore = cookies();
  const expectedNonce = cookieStore.get(NONCE_COOKIE)?.value;
  cookieStore.delete(NONCE_COOKIE);
  if (!nonce || !expectedNonce || nonce !== expectedNonce) return done("error=bad_state");

  // Clients can only complete OAuth for their own tenant.
  if (user.role === "client" && clientId !== user.client_id) return done("error=forbidden");

  // Meta Lead Ads (Leads page) shares this registered redirect URI.
  if (provider === "meta_leads") {
    const admin = createAdminClient();
    const back = (q: string) => NextResponse.redirect(`${origin}/leads?${backTo}${q}`);
    if (!admin) return back("meta=not_configured");
    try {
      const userToken = await exchangeMetaCode({ code, redirectUri: `${origin}/api/integrations/oauth/callback` });
      if (!(await listMetaPages(userToken)).length) return back("meta=no_pages");
      // Which pages belong to this partner is chosen on the Leads page.
      cookieStore.set(META_PICK_COOKIE, sealMetaPick({ t: userToken, c: clientId, u: user.id }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: META_PICK_TTL_SEC,
        path: "/api/leads/meta",
      });
      return back("meta=pick");
    } catch (e) {
      const m = (e as Error).message;
      return back(`meta=${m === "missing_scope" || m === "token_exchange" || m === "not_configured" ? m : "failed"}`);
    }
  }

  // Google Sheet lead source (Leads page): store the read-only grant, then pick tabs there.
  if (provider === "google_sheet") {
    const back = (q: string) => NextResponse.redirect(`${origin}/leads?${backTo}${q}`);
    const admin = createAdminClient();
    const gid = process.env.GOOGLE_CLIENT_ID;
    const gsecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!admin || !gid || !gsecret) return back("sheet=not_configured");
    let sheet = "";
    try {
      sheet = String(JSON.parse(Buffer.from(state, "base64url").toString()).sheet ?? "");
    } catch {
      /* checked below */
    }
    if (!/^[a-zA-Z0-9_-]{20,}$/.test(sheet)) return back("sheet=bad_url");
    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: gid, client_secret: gsecret, code, redirect_uri: `${origin}/api/integrations/oauth/callback`, grant_type: "authorization_code" }),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (!tok?.access_token) return back("sheet=failed");
    if (!String(tok.scope ?? "").split(/\s+/).includes(SHEETS_SCOPE)) return back("sheet=missing_scope");
    if (!tok.refresh_token) return back("sheet=failed");
    let meta: Awaited<ReturnType<typeof sheetMeta>>;
    try {
      meta = await sheetMeta(tok.access_token, sheet);
    } catch (e) {
      const st = e instanceof SheetError ? e.status : 0;
      return back(`sheet=${st === 403 ? "no_access" : st === 404 ? "not_found" : "failed"}`);
    }
    // Reconnecting keeps the chosen tabs and what was imported already.
    const { data: prev } = await admin.from("lead_sources").select("config").eq("client_id", clientId).eq("kind", "google_sheet").eq("external_id", sheet).maybeSingle();
    const prevCfg = (prev?.config ?? {}) as SheetConfig;
    const { data: saved, error } = await admin
      .from("lead_sources")
      .upsert(
        {
          client_id: clientId,
          kind: "google_sheet",
          label: meta.title.slice(0, 120) || "Google Sheet",
          external_id: sheet,
          access_token: tok.refresh_token,
          status: "active",
          last_error: null,
          created_by: user.id,
          config: { ...prevCfg, spreadsheetId: sheet, title: meta.title, timeZone: meta.timeZone, tabs: (prevCfg.tabs ?? []).filter((t) => meta.tabs.some((x) => x.title === t)) },
        },
        { onConflict: "client_id,kind,external_id" },
      )
      .select("id")
      .single();
    if (error || !saved) return back(/kind_check|config/.test(error?.message ?? "") ? "sheet=migration" : "sheet=failed");
    await logAudit(user, { action: "lead_source.create", clientId, targetType: "lead_source", targetId: saved.id, summary: `google_sheet: ${meta.title.slice(0, 80)}` }, admin);
    return back(`sheet=pick&source=${saved.id}`);
  }

  const cfg = oauthConfig(provider);
  const admin = createAdminClient();
  if (!cfg || !admin) return done("error=not_configured");

  // Exchange the authorization code for tokens.
  const redirectUri = `${origin}/api/integrations/oauth/callback`;
  const tokenRes = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  }).catch(() => null);

  const token = tokenRes ? await tokenRes.json().catch(() => null) : null;
  if (!token?.access_token) return done("error=token_exchange");

  // Google's consent screen lets people untick individual permissions. The token
  // then lacks this provider's scope (it may only carry scopes granted earlier,
  // e.g. Analytics), and every sync would fail — refuse it instead of saving a
  // "connected" source that can never work.
  if (cfg.tokenUrl.includes("googleapis.com")) {
    const granted = String(token.scope ?? "").split(/\s+/);
    if (!granted.includes(cfg.scope)) return done(`error=missing_scope&provider=${provider}`);
  }

  // Meta's OAuth code yields a ~1-2h user token; swap it for the long-lived
  // (~60 day) one so the daily sync keeps working.
  if (provider === "meta_ads") {
    const ll = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        fb_exchange_token: token.access_token,
      })}`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (ll?.access_token) token.access_token = ll.access_token;
    // Long-lived Meta user tokens expire after ~60 days; record when, so the
    // expiry is visible before syncs start failing.
    const expiresIn = Number(ll?.expires_in ?? token.expires_in);
    if (expiresIn > 0) token.expires_at = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Meta also allows declining individual permissions — ads_read is required.
    const perms = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/me/permissions?access_token=${encodeURIComponent(token.access_token)}`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const adsRead = (perms?.data ?? []).find((p: { permission: string; status: string }) => p.permission === "ads_read");
    if (perms && adsRead?.status !== "granted") return done(`error=missing_scope&provider=${provider}`);
  }

  const { data: existing } = await admin
    .from("integrations")
    .select("meta")
    .eq("client_id", clientId)
    .eq("provider", provider)
    .maybeSingle();

  const {
    lastError: _e,
    lastErrorAt: _a,
    lastErrorDetail: _d,
    tokenExpiresAt: _x,
    ...prevMeta
  } = (existing?.meta ?? {}) as Record<string, unknown>;

  const { error: upsertError } = await admin.from("integrations").upsert(
    {
      client_id: clientId,
      provider,
      status: "connected",
      account_label: `${provider} (live)`,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      // Who authorised this token decides who may point it at other accounts.
      // A fresh grant clears the previous failure; the next sync re-checks it.
      meta: {
        ...prevMeta,
        tokenOwner: user.role === "client" ? "client" : "staff",
        ...(token.expires_at ? { tokenExpiresAt: token.expires_at } : {}),
      },
    },
    { onConflict: "client_id,provider" },
  );
  if (upsertError) return done("error=save_failed");

  return done(`connected=${provider}`);
}
