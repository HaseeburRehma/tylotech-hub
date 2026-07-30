import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { TOOL_DEFS } from "@/lib/ai/prompts";
import { config } from "@/lib/config";
import { getRateLimiter, ipKey, rateLimitHeaders } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MODEL = config.ai.model;

export async function POST(req: Request) {
  // Rate limit per authenticated user (falls back to IP) — protects spend & abuse.
  const supabase = createClient();
  const userId = supabase ? (await supabase.auth.getUser()).data.user?.id : null;
  const rl = await getRateLimiter().limit(`ai:${userId ?? ipKey(req)}`, config.rateLimit.ai);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please slow down and try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: { tool?: string; inputs?: Record<string, string>; brand?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { tool, inputs = {}, brand = "your brand" } = body;
  const def = tool ? TOOL_DEFS[tool] : undefined;
  if (!def) {
    return NextResponse.json({ error: "Unknown tool" }, { status: 404 });
  }

  // The system prompt is editable by staff via the ai_tools table; fall back to code.
  let systemPrompt = def.system;
  if (supabase) {
    const { data } = await supabase
      .from("ai_tools")
      .select("prompt_template,is_active")
      .eq("slug", tool)
      .maybeSingle();
    if (data?.is_active === false) {
      return NextResponse.json({ error: "This tool is currently disabled." }, { status: 403 });
    }
    if (data?.prompt_template) systemPrompt = data.prompt_template;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Graceful fallback so the tool is demoable without a key.
  if (!apiKey) {
    return NextResponse.json({ output: def.mock(inputs, brand), demo: true });
  }

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: config.ai.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: def.buildUser(inputs, brand) }],
    });
    const output = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return NextResponse.json({ output, demo: false });
  } catch (err) {
    console.error("Claude API error", err);
    return NextResponse.json(
      { error: "AI generation failed. Please try again." },
      { status: 502 },
    );
  }
}
