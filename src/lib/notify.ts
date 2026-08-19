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

type Recipient = { id: string; email?: string | null };

const notifRow = (userId: string, n: NotifyInput) => ({
  user_id: userId,
  title: n.title,
  body: n.body ?? null,
  href: n.href ?? null,
  type: n.type ?? "info",
});

/** Postgres "column does not exist" — the only error we treat as "pre-0018". */
const isMissingColumn = (err: any) => err?.code === "42703" || /last_email_at/i.test(err?.message ?? "");

/** Fetch recipient ids/emails for a set of users. */
async function fetchRecipients(admin: any, apply: (q: any) => any): Promise<Recipient[]> {
  const res = await apply(admin.from("users").select("id,email"));
  return (res.data ?? []) as Recipient[];
}

/**
 * Send at most one email per recipient per cooldown window.
 *
 * The throttle is an ATOMIC CLAIM, not read-then-write: a single conditional
 * UPDATE stamps `last_email_at` only for rows still past the cooldown and returns
 * exactly the rows THIS call won. Postgres row locking means two concurrent
 * message posts (a burst) can't both claim the same recipient, so the burst
 * collapses to one email. We stamp before sending — a failed send costs one
 * skipped notice rather than risking a spam loop, the safer trade for a live client.
 */
async function dispatchEmails(admin: any, users: Recipient[], n: NotifyInput) {
  if (!n.email) return;
  const withEmail = users.filter((u) => u.email);
  if (!withEmail.length) return;
  const now = Date.now();
  const cutoff = new Date(now - COOLDOWN_MS).toISOString();

  const { data: claimed, error } = await admin
    .from("users")
    .update({ last_email_at: new Date(now).toISOString() })
    .in("id", withEmail.map((u) => u.id))
    .or(`last_email_at.is.null,last_email_at.lt.${cutoff}`)
    .select("id,email");

  if (error) {
    // Pre-0018 (no column): can't throttle, so send once — matches old behavior.
    // Any other error: skip sending rather than risk an unthrottled spam loop.
    if (isMissingColumn(error)) {
      await Promise.all(withEmail.map((u) => sendChatEmail(u.email!, { ...n.email!, href: n.href ?? "/chat" })));
    } else {
      console.error("dispatchEmails claim failed:", error.message);
    }
    return;
  }

  const due = ((claimed ?? []) as Recipient[]).filter((u) => u.email);
  await Promise.all(due.map((u) => sendChatEmail(u.email!, { ...n.email!, href: n.href ?? "/chat" })));
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
