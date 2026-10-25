import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export interface SearchHit {
  type: "Document" | "Project" | "Update" | "Client" | "Message";
  label: string;
  href: string;
  /** Extra line, e.g. "Fahrschule X · Anna · 14.10." for messages. */
  meta?: string;
}

const slugOf = (row: any): string | null => (Array.isArray(row?.clients) ? row.clients[0]?.slug : row?.clients?.slug) ?? null;

/** ~90 characters of the message around the first match. */
function snippet(text: string, q: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  const i = flat.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0 || flat.length <= 90) return flat.slice(0, 90) + (flat.length > 90 ? "…" : "");
  const start = Math.max(0, i - 30);
  return (start > 0 ? "…" : "") + flat.slice(start, start + 90) + (start + 90 < flat.length ? "…" : "");
}

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const sb = createClient();
  if (!sb) return NextResponse.json({ results: [] });

  const like = `%${q.replace(/[%_]/g, "")}%`;
  const staff = user.role !== "client";

  // RLS scopes every query to what the user is allowed to see.
  // Messages: run two parallel ilike queries instead of string-interpolating
  // user input into a PostgREST .or() filter (injection risk).
  const [docs, projs, ups, clis, msgContent, msgTranslated] = await Promise.all([
    sb.from("documents").select("id,name,client_id,clients(slug)").ilike("name", like).limit(5),
    sb.from("projects").select("id,name,client_id").ilike("name", like).limit(5),
    sb.from("updates").select("id,title,client_id,clients(slug)").ilike("title", like).limit(5),
    staff
      ? sb.from("clients").select("*").ilike("company", like).limit(8)
      : Promise.resolve({ data: [] as any[] }),
    sb
      .from("messages")
      .select("id,client_id,sender_name,content,content_translated,created_at,clients(company,slug)")
      .ilike("content", like)
      .order("created_at", { ascending: false })
      .limit(8),
    sb
      .from("messages")
      .select("id,client_id,sender_name,content,content_translated,created_at,clients(company,slug)")
      .ilike("content_translated", like)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  // Merge and deduplicate message results by id.
  const seenIds = new Set<string>();
  const msgs = { data: [] as any[] };
  for (const m of [...(msgContent.data ?? []), ...(msgTranslated.data ?? [])]) {
    if (!seenIds.has(m.id)) {
      seenIds.add(m.id);
      msgs.data.push(m);
    }
  }
  msgs.data.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  msgs.data = msgs.data.slice(0, 8);

  const results: SearchHit[] = [];
  for (const d of docs.data ?? [])
    results.push({ type: "Document", label: d.name, href: staff ? `/internal/clients/${slugOf(d) ?? d.client_id}` : "/documents" });
  for (const p of projs.data ?? [])
    results.push({ type: "Project", label: p.name, href: staff ? "/internal/projects" : "/dashboard" });
  for (const u of ups.data ?? [])
    results.push({ type: "Update", label: u.title, href: staff ? `/internal/clients/${slugOf(u) ?? u.client_id}` : "/chat" });
  for (const m of (msgs.data ?? []) as any[]) {
    const cl = Array.isArray(m.clients) ? m.clients[0] : m.clients;
    const text = (m.content ?? "").toLowerCase().includes(q.toLowerCase()) ? m.content : m.content_translated ?? m.content ?? "";
    const when = new Date(m.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Berlin" });
    results.push({
      type: "Message",
      label: snippet(text, q),
      meta: [m.client_id ? cl?.company ?? "—" : "TyloTech Team", m.sender_name, when].filter(Boolean).join(" · "),
      href: !staff ? `/chat?msg=${m.id}` : m.client_id ? `/internal/clients/${cl?.slug ?? m.client_id}?tab=chat&msg=${m.id}` : `/internal/team?msg=${m.id}`,
    });
  }
  for (const c of (clis.data ?? []).filter((c: any) => !c.archived_at))
    results.push({ type: "Client", label: c.company, href: `/internal/clients/${c.slug ?? c.id}` });

  return NextResponse.json({ results });
}
