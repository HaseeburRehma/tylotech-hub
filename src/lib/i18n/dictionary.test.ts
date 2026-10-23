import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { DICT } from "./dictionary";

const de = DICT.de as Record<string, string>;
const en = DICT.en as Record<string, string>;
const vars = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(tsx?)$/.test(f) && !f.endsWith(".test.ts") ? [p] : [];
  });
}

describe("i18n dictionary", () => {
  it("German and English have the same keys", () => {
    expect(Object.keys(de).filter((k) => !(k in en))).toEqual([]);
    expect(Object.keys(en).filter((k) => !(k in de))).toEqual([]);
  });

  it("both languages use the same {placeholders}", () => {
    const mismatched = Object.keys(en).filter((k) => k in de && vars(en[k]).join() !== vars(de[k]).join());
    expect(mismatched).toEqual([]);
  });

  it("every literal t(\"key\") used in the app exists", () => {
    const used = new Set<string>();
    for (const file of sourceFiles(join(__dirname, "..", ".."))) {
      const src = readFileSync(file, "utf8");
      // t("a.b"), tr("a.b"), translate(locale, "a.b") — dotted keys only.
      const re = /\b(?:t|tr|translate\([^,]+,)\s*\(?\s*"([a-zA-Z]+(?:\.[a-zA-Z0-9]+)+)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(100);
    expect(Array.from(used).filter((k) => !(k in en)).sort()).toEqual([]);
  });
});
