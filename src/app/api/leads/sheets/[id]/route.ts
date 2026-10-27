import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { UUID_RE, bad } from "@/lib/leads";
import { SheetError, readTabs, sheetErrorText, sheetMeta, sheetToken, syncSheetSource, type SheetConfig } from "@/lib/leads-sheets";
import { getRateLimiter } from "@/lib/rate-limit";
import { looksLikeLeadTab } from "@/lib/sheet-leads-parse";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A google_sheet source the caller may manage: the team, or the partner's own people. */
async function sheetSource(id: string) {
  const user = await getAuthUser();
  if (!user) return { error: bad("Unauthorized.", 401) } as const;
  if (!UUID_RE.test(id)) return { error: bad("Invalid id.") } as const;
  const admin = createAdminClient();
  if (!admin) return { error: bad("Backend not configured.", 503) } as const;
  const { data: src } = await admin.from("lead_sources").select("id,client_id,kind,label,external_id,access_token,config").eq("id", id).maybeSingle();
  if (!src || src.kind !== "google_sheet" || (!isStaff(user) && src.client_id !== user.client_id)) return { error: bad("Not found.", 404) } as const;
  const rl = await getRateLimiter().limit(`lead-sheet:${user.id}`, { limit: 20, windowSec: 60 });
  if (!rl.success) return { error: bad("Too many requests. Try again in a minute.", 429) } as const;
  return { user, admin, src: src as typeof src & { config: SheetConfig | null } } as const;
}

/** Tabs of the sheet: name, rows, whether it looks like a lead list, whether it's read. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await sheetSource(params.id);
  if ("error" in ctx) return ctx.error;
  const token = await sheetToken(ctx.src.access_token);
  if (!token) return bad("Google-Zugriff abgelaufen. Bitte das Sheet neu verbinden.", 409);
  try {
    const meta = await sheetMeta(token, ctx.src.external_id!);
    const visible = meta.tabs.filter((t) => !t.hidden).sort((a, b) => a.index - b.index).slice(0, 40);
    const titles = visible.map((t) => t.title);
    // Headers + the first three columns: enough to judge and count rows.
    const heads = await readTabs(token, ctx.src.external_id!, titles, "A1:CZ1");
    const firstCols = await readTabs(token, ctx.src.external_id!, titles, "A2:C5000");
    const chosen = new Set(ctx.src.config?.tabs ?? []);
    return NextResponse.json({
      title: meta.title,
      tabs: visible.map((t) => ({
        title: t.title,
        rows: (firstCols[t.title] ?? []).filter((r) => r.some((v) => v !== "" && v != null)).length,
        leadLike: looksLikeLeadTab(heads[t.title]?.[0] ?? []),
        chosen: chosen.has(t.title),
      })),
    });
  } catch (e) {
    return bad(sheetErrorText(e), e instanceof SheetError && e.status === 403 ? 403 : 502);
  }
}

/** Choose the tabs to read ({ tabs }), then import right away. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await sheetSource(params.id);
  if ("error" in ctx) return ctx.error;
  const b = (await req.json().catch(() => null)) as { tabs?: unknown } | null;
  const want = Array.isArray(b?.tabs) ? Array.from(new Set(b!.tabs.filter((t): t is string => typeof t === "string" && t.length > 0 && t.length <= 100))) : null;
  if (!want || !want.length || want.length > 10) return bad("Pick 1 to 10 tabs.");
  const token = await sheetToken(ctx.src.access_token);
  if (!token) return bad("Google-Zugriff abgelaufen. Bitte das Sheet neu verbinden.", 409);
  let real: string[];
  try {
    real = (await sheetMeta(token, ctx.src.external_id!)).tabs.map((t) => t.title);
  } catch (e) {
    return bad(sheetErrorText(e), 502);
  }
  if (want.some((t) => !real.includes(t))) return bad("Unknown tab.");
  const config: SheetConfig = { ...(ctx.src.config ?? {}), tabs: want };
  const { error } = await ctx.admin.from("lead_sources").update({ config, status: "active", last_error: null }).eq("id", ctx.src.id);
  if (error) return bad("Could not save the tabs.");
  await logAudit(ctx.user, { action: "lead_source.update", clientId: ctx.src.client_id, targetType: "lead_source", targetId: ctx.src.id, summary: `tabs: ${want.join(", ").slice(0, 200)}` }, ctx.admin);
  const r = await syncSheetSource(ctx.admin, { ...ctx.src, config }, { budgetMs: 45_000 });
  return NextResponse.json({ ok: !r.error, ...r });
}

/** Read the sheet now. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await sheetSource(params.id);
  if ("error" in ctx) return ctx.error;
  const r = await syncSheetSource(ctx.admin, ctx.src, { budgetMs: 45_000 });
  if (r.error && !r.added && !r.updated) return bad(r.error, 502);
  return NextResponse.json({ ok: true, ...r });
}
