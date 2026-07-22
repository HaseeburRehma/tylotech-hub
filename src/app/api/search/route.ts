import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export interface SearchHit {
  type: "Document" | "Project" | "Update" | "Client";
  label: string;
  href: string;
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
  const [docs, projs, ups, clis] = await Promise.all([
    sb.from("documents").select("id,name,client_id").ilike("name", like).limit(5),
    sb.from("projects").select("id,name,client_id").ilike("name", like).limit(5),
    sb.from("updates").select("id,title,client_id").ilike("title", like).limit(5),
    staff
      ? sb.from("clients").select("id,company").ilike("company", like).limit(5)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const results: SearchHit[] = [];
  for (const d of docs.data ?? [])
    results.push({ type: "Document", label: d.name, href: staff ? `/internal/clients/${d.client_id}` : "/documents" });
  for (const p of projs.data ?? [])
    results.push({ type: "Project", label: p.name, href: staff ? "/internal/projects" : "/dashboard" });
  for (const u of ups.data ?? [])
    results.push({ type: "Update", label: u.title, href: staff ? `/internal/clients/${u.client_id}` : "/chat" });
  for (const c of clis.data ?? [])
    results.push({ type: "Client", label: c.company, href: `/internal/clients/${c.id}` });

  return NextResponse.json({ results });
}
