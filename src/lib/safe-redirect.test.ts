import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safe-redirect";

describe("safeRedirect", () => {
  it("keeps same-origin paths", () => {
    expect(safeRedirect("/internal/clients?tab=chat")).toBe("/internal/clients?tab=chat");
  });

  it.each([
    "//evil.com",
    "https://evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "javascript:alert(1)",
    "/<script>alert(1)</script>",
    "/x\"onmouseover=alert(1)",
    "' OR 1=1--",
  ])("rejects %j", (raw) => {
    expect(safeRedirect(raw)).toBe("/dashboard");
  });
});
