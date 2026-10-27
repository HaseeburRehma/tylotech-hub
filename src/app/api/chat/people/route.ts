import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { listClientUsers, listTeamPeers } from "@/lib/data";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Who can read a client chat, for read receipts ("seen by" with photos) in the
 * app: the TyloTech team plus that client's users. Clients only ever get their
 * own company (?clientId is ignored for them); staff pass ?clientId. Id, name
 * and photo only, the same as the web chat's member list.
 */
export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const asked = new URL(req.url).searchParams.get("clientId");
  const clientId = isStaff(user) ? (asked && UUID_RE.test(asked) ? asked : null) : user.client_id;
  const [team, people] = await Promise.all([listTeamPeers(), listClientUsers(clientId)]);
  const out = [...team, ...people].map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl ?? null }));
  return NextResponse.json({ people: out }, { headers: { "Cache-Control": "private, max-age=300" } });
}
