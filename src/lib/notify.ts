import { createAdminClient } from "@/lib/supabase/admin";
import { sendChatEmail } from "@/lib/email";

interface NotifyInput {
  title: string;
  body?: string;
  href?: string;
  type?: string;
  /** When set, also send a bilingual email to each recipient. */
  email?: { senderName: string; preview: string; isFile?: boolean };
}

const notifRow = (userId: string, n: NotifyInput) => ({
  user_id: userId,
  title: n.title,
  body: n.body ?? null,
  href: n.href ?? null,
  type: n.type ?? "info",
});

async function emailRecipients(rows: { email?: string | null }[], n: NotifyInput) {
  if (!n.email) return;
  await Promise.all(
    rows
      .filter((r): r is { email: string } => !!r.email)
      .map((r) => sendChatEmail(r.email, { ...n.email!, href: n.href ?? "/chat" })),
  );
}

/** In-app notification (+ optional email) for a single user — used for direct messages. */
export async function notifyUser(userId: string, n: NotifyInput) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("notifications").insert(notifRow(userId, n));
  if (n.email) {
    const { data } = await admin.from("users").select("email").eq("id", userId).single();
    await emailRecipients(data ? [data] : [], n);
  }
}

/** In-app notification (+ optional email) for every client-side user of a tenant. */
export async function notifyClientUsers(clientId: string, n: NotifyInput) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: users } = await admin
    .from("users")
    .select("id,email")
    .eq("client_id", clientId)
    .eq("role", "client");
  if (!users?.length) return;
  await admin.from("notifications").insert(users.map((u: { id: string }) => notifRow(u.id, n)));
  await emailRecipients(users, n);
}

/** In-app notification (+ optional email) for all TyloTech staff. */
export async function notifyStaff(n: NotifyInput) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: users } = await admin.from("users").select("id,email").in("role", ["admin", "team"]);
  if (!users?.length) return;
  await admin.from("notifications").insert(users.map((u: { id: string }) => notifRow(u.id, n)));
  await emailRecipients(users, n);
}
