import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listNotifications } from "@/lib/data";
import { resetEmailCooldown } from "@/lib/notify";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const items = await listNotifications(user.id);
  return NextResponse.json({ items, unread: items.filter((i) => !i.read).length });
}

export async function PATCH(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const sb = createClient();
  if (!sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { id?: string; hrefPrefix?: string };
  let q = sb.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
  if (b.id) {
    q = q.eq("id", b.id);
  } else if (b.hrefPrefix) {
    // Mark read only notifications whose link lives under this section (e.g.
    // opening /chat clears chat notifications). "%" is escaped so it's literal.
    const prefix = b.hrefPrefix.replace(/[%_]/g, "\\$&");
    q = q.like("href", `${prefix}%`);
  }
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // Caught up on ALL notifications → let the next new message email them again.
  if (!b.id && !b.hrefPrefix) await resetEmailCooldown(user.id);
  return NextResponse.json({ ok: true });
}
