import { createAdminClient } from "@/lib/supabase/admin";
import { sendChatEmail } from "@/lib/email";

/** At most one notification email per recipient per this window (a burst → 1 email). */
const COOLDOWN_MS = 30 * 60 * 1000;

interface NotifyInput {
  title: string;
  body?: string;
  href?: string;
  type?: string;
  /** When set, also send a throttled bilingual email to each recipient. */
  email?: { senderName: string; preview: string; isFile?: boolean };
}

type Recipient = { id: string; email?: string | null; last_email_at?: string | null };

const notifRow = (userId: string, n: NotifyInput) => ({
  user_id: userId,
  title: n.title,
  body: n.body ?? null,
  href: n.href ?? null,
  type: n.type ?? "info",
});

/** Fetch recipients tolerant of `last_email_at` not existing yet (pre-0018). */
async function fetchRecipients(admin: any, apply: (q: any) => any): Promise<Recipient[]> {
  let res = await apply(admin.from("users").select("id,email,last_email_at"));
  if (res.error) res = await apply(admin.from("users").select("id,email"));
  return (res.data ?? []) as Recipient[];
}

/** Send emails only to recipients past the cooldown, then stamp last_email_at. */
async function dispatchEmails(admin: any, users: Recipient[], n: NotifyInput) {
  if (!n.email) return;
  const now = Date.now();
  const due = users.filter(
    (u) => u.email && (u.last_email_at == null || now - new Date(u.last_email_at).getTime() > COOLDOWN_MS),
  );
  if (!due.length) return;
  await Promise.all(due.map((u) => sendChatEmail(u.email!, { ...n.email!, href: n.href ?? "/chat" })));
  // Best-effort stamp (no-op/error-ignored if the column isn't migrated yet).
  await admin
    .from("users")
    .update({ last_email_at: new Date(now).toISOString() })
    .in("id", due.map((u) => u.id));
}

/** In-app notification (+ throttled email) for a single user — used for direct messages. */
export async function notifyUser(userId: string, n: NotifyInput) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("notifications").insert(notifRow(userId, n));
  if (n.email) {
    const users = await fetchRecipients(admin, (q) => q.eq("id", userId));
    await dispatchEmails(admin, users, n);
  }
}

/** In-app notification (+ throttled email) for every client-side user of a tenant. */
export async function notifyClientUsers(clientId: string, n: NotifyInput) {
  const admin = createAdminClient();
  if (!admin) return;
  const users = await fetchRecipients(admin, (q) => q.eq("client_id", clientId).eq("role", "client"));
  if (!users.length) return;
  await admin.from("notifications").insert(users.map((u) => notifRow(u.id, n)));
  await dispatchEmails(admin, users, n);
}

/** In-app notification (+ throttled email) for all TyloTech staff. */
export async function notifyStaff(n: NotifyInput) {
  const admin = createAdminClient();
  if (!admin) return;
  const users = await fetchRecipients(admin, (q) => q.in("role", ["admin", "team"]));
  if (!users.length) return;
  await admin.from("notifications").insert(users.map((u) => notifRow(u.id, n)));
  await dispatchEmails(admin, users, n);
}

/** Reset a user's email cooldown when they've caught up (called on "mark read"). */
export async function resetEmailCooldown(userId: string) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("users").update({ last_email_at: null }).eq("id", userId);
}
