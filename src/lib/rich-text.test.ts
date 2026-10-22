import { describe, expect, it } from "vitest";
import { renderRich } from "./rich-text";

// Stored-XSS payloads a partner or team member could type into chat.
const PAYLOADS = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "<svg/onload=alert(1)>",
  "javascript:alert(1)",
  "[x](javascript:alert(1))",
  'https://ok.com"onmouseover="alert(1)',
  "https://ok.com/'><script>alert(1)</script>",
  "**<b onclick=alert(1)>x</b>**",
  "@<img src=x onerror=alert(1)>",
  "\u00000\u0000",
];

describe("renderRich", () => {
  it.each(PAYLOADS)("never emits executable markup for %j", (p) => {
    const html = renderRich(p);
    const tags = html.match(/<[^>]*>/g) ?? [];
    for (const tag of tags) {
      expect(tag).toMatch(/^<\/?(strong|mark|span|a)[\s>]/); // only our own formatting tags
      expect(tag).not.toMatch(/\son[a-z]+\s*=/i); // no event-handler attributes
      expect(tag).not.toMatch(/href="(?!https?:)/i); // links are http(s) only
    }
  });

  it("still formats the supported syntax", () => {
    expect(renderRich("**hi** https://tylohq.de")).toBe(
      '<strong>hi</strong> <a href="https://tylohq.de" target="_blank" rel="noopener noreferrer" class="break-all underline decoration-current/40 underline-offset-2 hover:decoration-current">https://tylohq.de</a>',
    );
  });
});
