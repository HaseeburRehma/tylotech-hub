import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived links to one creative that work without a session: for the
 * mobile app's video player and "open PDF" (which can't send our sign-in
 * header). Signed with a server secret, bound to the creative and variant,
 * valid for 15 minutes.
 */
const TTL_SEC = 15 * 60;
export type LinkVariant = "file" | "thumb" | "preview";

function key() {
  const k = process.env.CREATIVE_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("no link secret");
  return k;
}

const mac = (id: string, variant: LinkVariant, exp: number) => createHmac("sha256", key()).update(`creative:${id}:${variant}:${exp}`).digest("base64url");

export function signCreativeLink(origin: string, id: string, variant: LinkVariant, now = Date.now()) {
  const exp = Math.floor(now / 1000) + TTL_SEC;
  const q = new URLSearchParams({ exp: String(exp), sig: mac(id, variant, exp) });
  if (variant !== "file") q.set(variant, "1");
  return `${origin}/api/creatives/${id}/file?${q.toString()}`;
}

export function verifyCreativeLink(id: string, variant: LinkVariant, exp: string | null, sig: string | null, now = Date.now()): boolean {
  const e = Number(exp);
  if (!sig || !Number.isInteger(e) || e < now / 1000 || e > now / 1000 + TTL_SEC + 60) return false;
  const want = Buffer.from(mac(id, variant, e));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
