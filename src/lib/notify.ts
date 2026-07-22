import { createAdminClient } from "@/lib/supabase/admin";

interface NotifyInput {
  title: string;
  body?: string;
  href?: string;
  type?: string;
}

/** Create an in-app notification for every client-side user of a tenant. */
export async function notifyClientUsers(clientId: string, n: NotifyInput) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: users } = await admin
    .from("users")
    .select("id")
    .eq("client_id", clientId)
    .eq("role", "client");
  if (!users?.length) return;
  await admin.from("notifications").insert(
    users.map((u: { id: string }) => ({
      user_id: u.id,
      title: n.title,
      body: n.body ?? null,
      href: n.href ?? null,
      type: n.type ?? "info",
    })),
  );
}

/** Create an in-app notification for all TyloTech staff. */
export async function notifyStaff(n: NotifyInput) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: users } = await admin.from("users").select("id").in("role", ["admin", "team"]);
  if (!users?.length) return;
  await admin.from("notifications").insert(
    users.map((u: { id: string }) => ({
      user_id: u.id,
      title: n.title,
      body: n.body ?? null,
      href: n.href ?? null,
      type: n.type ?? "info",
    })),
  );
}
