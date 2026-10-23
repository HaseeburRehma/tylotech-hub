/**
 * Chat message → HTML for dangerouslySetInnerHTML. Everything is HTML-escaped
 * first; only then are **bold**, ==highlight==, @mentions and http(s) links
 * turned into markup, so user text can never introduce tags or attributes.
 */
export function renderRich(text: string): string {
  // NUL is our link placeholder below — never let user text forge one.
  const esc = text.replace(/\u0000/g, "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  // Links first (only http/https; already escaped, so safe inside href), parked
  // as placeholders so the bold/mention rules below can't reach into a URL.
  const links: string[] = [];
  const parked = esc.replace(/\bhttps?:\/\/[^\s<]*[^\s<.,;:!?)\]'"*]/g, (url) => `\u0000${links.push(url) - 1}\u0000`);
  return parked
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/==([^=\n]+)==/g, '<mark style="background:rgba(201,168,76,.38);color:inherit;border-radius:3px;padding:0 2px">$1</mark>')
    .replace(/@([A-Za-zÀ-ÿ][\w\s]{0,30}[\w])/g, '<span class="text-brand-ink font-semibold">@$1</span>')
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => {
      const url = links[Number(i)]!;
      const label = url.length > 60 ? `${url.slice(0, 57)}…` : url;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="break-all underline decoration-current/40 underline-offset-2 hover:decoration-current">${label}</a>`;
    });
}
