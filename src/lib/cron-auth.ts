import { timingSafeEqual } from "crypto";

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Header only (never a
 * query param, which would end up in logs) and compared in constant time.
 */
export function isCronAuthorized(req: Request): boolean | "unconfigured" {
  const secret = process.env.CRON_SECRET;
  if (!secret) return "unconfigured";
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
