import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { translateMessage, type Lang } from "@/lib/ai/translate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const rl = await getRateLimiter().limit(`translate:${user.id}`, config.rateLimit.ai);
  if (!rl.success) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const b = (await req.json().catch(() => ({}))) as { text?: string; texts?: unknown; items?: unknown; target?: string };
  const target = b.target === "de" ? "de" : b.target === "en" ? "en" : null;

  // Batch mode for "translate this conversation": up to 25 messages per call,
  // counted as one request against the rate limit. With message ids, a saved
  // translation is reused and a new one is stored on the message, so each
  // message is translated once — not on every view.
  if (Array.isArray(b.items) || Array.isArray(b.texts)) {
    if (!target) return NextResponse.json({ error: "target (en|de) is required." }, { status: 400 });
    const items = (Array.isArray(b.items) ? b.items : (b.texts as unknown[]).map((t) => ({ text: t })))
      .slice(0, 25)
      .map((x) => {
        const it = (x ?? {}) as { id?: unknown; text?: unknown };
        return { id: typeof it.id === "string" ? it.id : null, text: String(it.text ?? "").trim().slice(0, 5000) };
      });
    if (items.reduce((n, x) => n + x.text.length, 0) > 30000) return NextResponse.json({ error: "Text is too long." }, { status: 413 });

    // Only messages this user can read (RLS) are looked up / written back.
    const sb = createClient();
    const ids = items.map((x) => x.id).filter((x): x is string => !!x);
    const rows = new Map<string, { content: string; content_translated: string | null; translated_to: string | null }>();
    if (sb && ids.length) {
      const { data } = await sb.from("messages").select("id,content,content_translated,translated_to").in("id", ids);
      for (const r of data ?? []) rows.set(r.id, r);
    }

    const out: (string | null)[] = new Array(items.length).fill(null);
    const toSave: { id: string; text: string }[] = [];
    let next = 0;
    // A few at a time — gentle on the translation service.
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (next < items.length) {
          const i = next++;
          const it = items[i]!;
          if (!it.text) continue;
          const row = it.id ? rows.get(it.id) : undefined;
          if (row?.content_translated && row.translated_to === target) {
            out[i] = row.content_translated;
            continue;
          }
          out[i] = await translateMessage(it.text, target as Lang);
          // Store it on the message when it has no translation yet (and the text matches).
          if (out[i] && it.id && row && !row.content_translated && row.content.trim() === it.text && out[i]!.trim() !== it.text) {
            toSave.push({ id: it.id, text: out[i]! });
          }
        }
      }),
    );
    const admin = createAdminClient();
    if (admin && toSave.length) {
      await Promise.all(
        toSave.map((x) =>
          admin.from("messages").update({ content_translated: x.text, translated_to: target }).eq("id", x.id).is("content_translated", null),
        ),
      );
    }
    return NextResponse.json({ translations: out });
  }

  const text = b.text?.trim();
  if (!text || !target) {
    return NextResponse.json({ error: "text and target (en|de) are required." }, { status: 400 });
  }
  if (text.length > 5000) return NextResponse.json({ error: "Text is too long." }, { status: 413 });

  const translation = await translateMessage(text, target as Lang);
  // null = the translation service is unavailable (no key / API error / no credits).
  // Signal it so the UI can say "unavailable" instead of silently showing the original.
  if (translation == null) {
    return NextResponse.json({ error: "Translation service unavailable." }, { status: 502 });
  }
  return NextResponse.json({ translation });
}
