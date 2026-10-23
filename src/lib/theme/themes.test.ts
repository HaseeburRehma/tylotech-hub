import { describe, expect, it } from "vitest";
import { buildClientTheme, contrast, DARK_SURFACE, hexToRgb, isLight, readableOn, themeToCssVars, TYLOTECH_THEME } from "./themes";

describe("hexToRgb", () => {
  it("parses 6-digit hex", () => {
    expect(hexToRgb("#C9A84C")).toEqual([201, 168, 76]);
  });
  it("parses 3-digit shorthand", () => {
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
  });
  it("tolerates missing hash", () => {
    expect(hexToRgb("000000")).toEqual([0, 0, 0]);
  });
});

describe("isLight", () => {
  it("detects light colors", () => {
    expect(isLight([255, 255, 255])).toBe(true);
  });
  it("detects dark colors", () => {
    expect(isLight([10, 10, 10])).toBe(false);
  });
});

describe("buildClientTheme", () => {
  it("builds a theme from client colors and picks readable text", () => {
    const t = buildClientTheme({ id: "c1", company: "Acme", primary: "#38BDF8", secondary: "#0C141C" });
    expect(t.company).toBe("Acme");
    expect(t.primary).toEqual([56, 189, 248]);
    const vars = themeToCssVars(t);
    expect(vars["--brand"]).toBe("56 189 248");
  });

  it("uses an uploaded logo url when provided", () => {
    const t = buildClientTheme({ id: "c1", company: "Acme", primary: "#000", secondary: "#111", logoUrl: "https://x/y.png" });
    expect(t.logo).toEqual({ type: "url", value: "https://x/y.png" });
  });
});

describe("brand ink — gold is never text on white", () => {
  const rgb = (v: string) => v.split(" ").map(Number) as unknown as [number, number, number];

  it("TyloTech uses Figma's text/accent #94713F on light surfaces", () => {
    expect(themeToCssVars(TYLOTECH_THEME)["--brand-ink-light"]).toBe("148 113 63");
  });

  it.each(["#D1AA71", "#01FE21", "#FFBF00", "#38BDF8", "#7B2CFF", "#FFFFFF"])(
    "client colour %s gets a text shade readable on white and on dark petrol",
    (hex) => {
      const vars = themeToCssVars(buildClientTheme({ id: "c", company: "C", primary: hex, secondary: "#000" }));
      expect(contrast(rgb(vars["--brand-ink-light"]), [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(rgb(vars["--brand-ink-dark"]), DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("leaves colours that already read alone", () => {
    expect(readableOn([123, 44, 255], [255, 255, 255])).toEqual([123, 44, 255]);
  });
});
