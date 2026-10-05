import { redirect } from "next/navigation";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MembersView, type StaffRow } from "./view";

export default async function TeamMembersPage() {
  const user = await getAuthUser();
  if (!isStaff(user)) redirect("/dashboard");

  const admin = createAdminClient();
  let members: StaffRow[] = [];
  if (admin) {
    const [{ data: rows }, { data: authList }] = await Promise.all([
      admin.from("users").select("*").in("role", ["admin", "team"]).order("name"),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    const banned = new Map(
      (authList?.users ?? []).map((u) => [u.id, !!u.banned_until && new Date(u.banned_until).getTime() > Date.now()]),
    );
    const lastSeen = new Map((authList?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));
    members = (rows ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      title: r.title ?? null,
      avatarUrl: r.avatar_url ?? null,
      active: !r.deactivated_at && !banned.get(r.id),
      lastSignIn: lastSeen.get(r.id) ?? null,
    }));
  }

  return <MembersView members={members} currentUserId={user!.id} isAdmin={user!.role === "admin"} />;
}
