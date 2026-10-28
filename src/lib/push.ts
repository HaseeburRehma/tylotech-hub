/**
 * Mobile push via the Expo push service (→ APNs / FCM) for users who have the
 * TyloHQ app installed (user_devices, migration 0035).
 *
 * Who: clients get every push; staff only workflow ("Du bist dran") and new-lead
 * (Speed-to-Lead, 60 s) pushes.
 * Privacy: chat pushes carry only the title ("New message from …"), never the
 * message text, so client conversations don't pass through third-party push
 * infrastructure. Other notifications include their short body.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK = 100; // Expo accepts up to 100 messages per request

export interface PushInput {
  title: string;
  body?: string;
  href?: string;
  type?: string;
  /** Extra fields for the app (e.g. leadId, createdAt for the countdown). */
  data?: Record<string, string | number | boolean | null>;
  /** Time-critical (new lead): high priority, Android "leads" channel, short TTL. */
  urgent?: boolean;
}

/** The new-lead chime bundled in the TyloHQ app, and its Android channel (tylohq-mobile src/lib/push.ts). */
export const LEAD_SOUND = "new_lead.wav";
export const LEAD_CHANNEL = "new-leads";

/** Push types a staff phone gets; everything else stays in-app + email for staff. */
const STAFF_PUSH_TYPES = new Set(["workflow", "lead"]);

export async function sendPush(admin: any, userIds: string[], n: PushInput) {
  if (!userIds.length) return;
  // The staff app shows process steps and the lead alert, so staff phones get
  // those pushes only; chat etc. stays in-app + email for them.
  if (!STAFF_PUSH_TYPES.has(n.type ?? "")) {
    const { data: people } = await admin.from("users").select("id,role").in("id", userIds);
    userIds = ((people ?? []) as { id: string; role: string }[]).filter((p) => p.role === "client").map((p) => p.id);
    if (!userIds.length) return;
  }
  const { data: devices, error } = await admin.from("user_devices").select("expo_token").in("user_id", userIds);
  if (error || !devices?.length) return; // pre-0035 or nobody has the app

  const body = n.type === "message" ? undefined : n.body?.slice(0, 140);
  const messages = (devices as { expo_token: string }[]).map((d) => ({
    to: d.expo_token,
    title: n.title.slice(0, 120),
    ...(body ? { body } : {}),
    data: { ...(n.data ?? {}), href: n.href ?? "/dashboard", type: n.type ?? "info" },
    // Lead pushes ring the app's own chime; an app build without it plays the default sound.
    sound: n.urgent ? LEAD_SOUND : "default",
    ...(n.urgent ? { priority: "high", channelId: LEAD_CHANNEL, ttl: 300 } : {}),
  }));

  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += CHUNK) {
    const batch = messages.slice(i, i + CHUNK);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(batch),
    }).catch(() => null);
    const json: any = res ? await res.json().catch(() => null) : null;
    // Tickets come back in request order; drop tokens Apple/Google no longer accept.
    (json?.data ?? []).forEach((ticket: any, j: number) => {
      if (ticket?.details?.error === "DeviceNotRegistered") dead.push(batch[j]!.to);
    });
  }
  if (dead.length) await admin.from("user_devices").delete().in("expo_token", dead);
}
