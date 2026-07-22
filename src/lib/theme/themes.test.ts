import { describe, expect, it } from "vitest";
import { buildClientTheme, hexToRgb, isLight, themeToCssVars } from "./themes";

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
