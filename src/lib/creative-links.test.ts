import { beforeEach, describe, expect, it } from "vitest";
import { signCreativeLink, verifyCreativeLink } from "./creative-links";

const ID = "77777777-7777-4777-8777-777777777777";
beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
});

describe("signed creative links", () => {
  it("valid for this creative and variant for 15 minutes only", () => {
    const now = Date.UTC(2026, 9, 30, 12);
    const u = new URL(signCreativeLink("https://www.tylohq.de", ID, "thumb", now));
    const exp = u.searchParams.get("exp"), sig = u.searchParams.get("sig");
    expect(u.searchParams.get("thumb")).toBe("1");
    expect(verifyCreativeLink(ID, "thumb", exp, sig, now + 60_000)).toBe(true);
    expect(verifyCreativeLink(ID, "file", exp, sig, now)).toBe(false);
    expect(verifyCreativeLink("88888888-8888-4888-8888-888888888888", "thumb", exp, sig, now)).toBe(false);
    expect(verifyCreativeLink(ID, "thumb", exp, sig, now + 16 * 60_000)).toBe(false);
    expect(verifyCreativeLink(ID, "thumb", String(Number(exp) + 1), sig, now)).toBe(false);
    expect(verifyCreativeLink(ID, "thumb", exp, null, now)).toBe(false);
    // An expiry far in the future (a forged long-lived link) is refused even with a matching signature scheme.
    expect(verifyCreativeLink(ID, "thumb", String(Math.floor(now / 1000) + 86_400), sig, now)).toBe(false);
  });
});
