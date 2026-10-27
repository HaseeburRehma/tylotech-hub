/**
 * House style: no em dashes in anything TyloHQ writes (UI, emails, AI output).
 * AI models like them, so generated text is cleaned up: " — " joins clauses
 * with a comma, a bare "—" becomes a hyphen. People's own words are left alone.
 */
export const NO_DASH_RULE = "Never use em dashes (—). Use commas, colons or full stops instead.";

export function withoutEmDashes(text: string): string {
  return text.replace(/\s+—\s+/g, ", ").replace(/—/g, "-");
}
