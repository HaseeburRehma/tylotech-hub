/**
 * Prompt templates mirror the `ai_tools.prompt_template` column so Ilias can edit
 * them from the admin panel later. Each builder returns a system + user prompt pair.
 */
export interface ToolInput {
  [key: string]: string;
}

export interface ToolDef {
  slug: string;
  name: string;
  system: string;
  buildUser: (input: ToolInput, brand: string) => string;
  /** Used by the mock fallback when no API key is configured. */
  mock: (input: ToolInput, brand: string) => string;
}

export const TOOL_DEFS: Record<string, ToolDef> = {
  "content-generator": {
    slug: "content-generator",
    name: "Content Generator",
    system:
      "You are a senior social media copywriter for a premium marketing agency. Write concise, high-converting, on-brand content. Use a confident, modern voice. Never use hashtags unless asked. Output clean, ready-to-publish copy.",
    buildUser: (i, brand) =>
      `Brand: ${brand}\nChannel: ${i.platform || "Instagram"}\nTopic: ${i.topic}\nTone: ${i.tone || "Confident & friendly"}\n\nWrite 3 distinct post variations. For each, give a short hook line, the body, and a call to action.`,
    mock: (i, brand) =>
      `Here are 3 ${i.platform || "Instagram"} post ideas for ${brand} on "${i.topic}":\n\n1. Hook: Stop scrolling — this changes everything.\n   Body: ${i.topic} isn't just a trend, it's how ${brand} is redefining the category. Real results, real momentum.\n   CTA: Tap the link to see how.\n\n2. Hook: The secret behind our best month yet.\n   Body: We doubled down on ${i.topic} — and the numbers speak for themselves.\n   CTA: DM us "GROW" to learn more.\n\n3. Hook: You asked, we delivered.\n   Body: ${brand} is making ${i.topic} effortless. Premium, fast, and built for you.\n   CTA: Book your spot today.\n\n(Demo output — add your Anthropic API key for live Claude generation.)`,
  },
  "seo-analyzer": {
    slug: "seo-analyzer",
    name: "SEO Analyzer",
    system:
      "You are an expert technical and content SEO consultant. Given a URL or keyword, produce a prioritized, actionable audit. Group findings under Quick Wins, On-Page, Content, and Technical, then give a 30-day action plan. Be specific, concise and practical.",
    buildUser: (i, brand) =>
      `Brand: ${brand}\nTarget (URL or keyword): ${i.target}\nMarket/region: ${i.region || "global"}\n\nAnalyze the target and return prioritized SEO recommendations grouped by Quick Wins, On-Page, Content, Technical — followed by a focused 30-day action plan.`,
    mock: (i, brand) =>
      `SEO analysis for "${i.target}" — ${brand}:\n\nQUICK WINS\n• Add a unique title tag (≤60 chars) and meta description targeting "${i.target}".\n• Fix any broken internal links and add descriptive alt text to key images.\n• Submit an updated XML sitemap to Google Search Console.\n\nON-PAGE\n• Use one clear H1; structure content with H2/H3 around search intent.\n• Add internal links from high-authority pages to the target page.\n\nCONTENT\n• Build a topic cluster around "${i.target}" with 3–5 supporting articles.\n• Answer the top "People Also Ask" questions to win featured snippets.\n\nTECHNICAL\n• Improve Core Web Vitals: compress images, lazy-load, defer non-critical JS.\n• Ensure mobile responsiveness and HTTPS across all pages.\n\n30-DAY PLAN\nWeek 1: technical fixes · Week 2: on-page optimization · Week 3: publish cluster content · Week 4: build internal links + measure.\n\n(Demo output — add your Anthropic API key for live Claude analysis.)`,
  },
  audience: {
    slug: "audience",
    name: "Audience Insights",
    system:
      "You are a senior marketing strategist. Turn a short business description into clear, actionable audience personas and targeting guidance. Be specific and practical.",
    buildUser: (i, brand) =>
      `Brand: ${brand}\nBusiness / offer: ${i.business}\nRegion: ${i.region || "global"}\n\nCreate 3 distinct audience personas (name, demographics, motivations, objections, where to reach them) and a short paid-targeting recommendation for each.`,
    mock: (i, brand) =>
      `Audience personas for ${brand} — ${i.business}:\n\n1. "Ambitious Ava" (28–38, urban professional)\n   Motivations: status, time-saving. Objections: price.\n   Reach: Instagram, LinkedIn. Target: lookalikes of converters + interest stacks.\n\n2. "Practical Paul" (40–55, family decision-maker)\n   Motivations: reliability, value. Objections: trust.\n   Reach: Facebook, Google Search. Target: in-market + retargeting.\n\n3. "Gen-Z Grace" (18–26, trend-driven)\n   Motivations: identity, social proof. Objections: authenticity.\n   Reach: TikTok, Reels. Target: broad + creator content.\n\n(Demo output — add your Anthropic API key for live Claude output.)`,
  },
  email: {
    slug: "email",
    name: "Email Sequencer",
    system:
      "You are an expert lifecycle email copywriter. Write concise, high-converting nurture sequences with clear subject lines and CTAs. Keep each email short and skimmable.",
    buildUser: (i, brand) =>
      `Brand: ${brand}\nGoal: ${i.goal || "nurture new leads"}\nAudience: ${i.audience || "new subscribers"}\n\nWrite a 4-email sequence. For each: subject line, 3–4 sentence body, and CTA. Space them logically (day 0, 2, 5, 8).`,
    mock: (i, brand) =>
      `4-email nurture sequence for ${brand}:\n\nEmail 1 (Day 0) — Subject: Welcome to ${brand} 👋\nThanks for joining! Here's what to expect and how we help. Start here.\nCTA: See how it works\n\nEmail 2 (Day 2) — Subject: The #1 thing our clients get wrong\nA quick tip that saves time and money. Real example inside.\nCTA: Read the tip\n\nEmail 3 (Day 5) — Subject: Proof it works\nA short case study with numbers.\nCTA: See the results\n\nEmail 4 (Day 8) — Subject: Ready when you are\nA soft offer + easy next step.\nCTA: Book a call\n\n(Demo output — add your Anthropic API key for live Claude output.)`,
  },
  "lp-audit": {
    slug: "lp-audit",
    name: "Landing Page Auditor",
    system:
      "You are a conversion-rate optimization expert. Given a landing page URL or description, audit it section by section and give prioritized, specific improvements likely to lift conversion.",
    buildUser: (i, brand) =>
      `Brand: ${brand}\nLanding page: ${i.target}\nGoal: ${i.goal || "lead generation"}\n\nAudit the page: hero, social proof, offer clarity, CTA, friction, trust, mobile. Give prioritized fixes with expected impact.`,
    mock: (i, brand) =>
      `Landing page audit — ${i.target} (${brand}):\n\nHERO (High impact)\n• Lead with a benefit-driven headline; make the primary CTA above the fold.\n\nSOCIAL PROOF (High)\n• Add 2–3 client logos + a specific testimonial with a number.\n\nOFFER CLARITY (Medium)\n• State exactly what the visitor gets and what happens next.\n\nCTA (High)\n• One primary action, repeated; use action language ("Get my free audit").\n\nFRICTION (Medium)\n• Reduce form fields to 3; add trust markers near the button.\n\nMOBILE (Medium)\n• Ensure tap targets ≥44px and fast LCP.\n\n(Demo output — add your Anthropic API key for live Claude output.)`,
  },
  "ad-copy": {
    slug: "ad-copy",
    name: "Ad Copy Generator",
    system:
      "You are a direct-response performance marketer. Write tight, benefit-led ad copy optimized for click-through and conversions. Provide headlines and primary text suitable for Meta and Google Ads.",
    buildUser: (i, brand) =>
      `Brand: ${brand}\nProduct/Service: ${i.product}\nAudience: ${i.audience || "general"}\nGoal: ${i.goal || "lead generation"}\n\nGenerate: 3 Meta primary texts (max 125 chars), 5 Google headlines (max 30 chars), and 2 descriptions (max 90 chars).`,
    mock: (i, brand) =>
      `Ad copy for ${brand} — ${i.product}:\n\nMeta primary text:\n• Ready to upgrade? ${i.product} from ${brand} delivers results you can feel.\n• Join hundreds who switched to ${brand}. Limited spots this month.\n• ${i.product}, reimagined. Premium quality, unbeatable value.\n\nGoogle headlines:\n• ${brand} ${i.product}\n• Premium. Proven. Fast.\n• Get Started Today\n• Trusted By Hundreds\n• Limited-Time Offer\n\nDescriptions:\n• Discover why ${brand} is the smart choice for ${i.product}. Book now.\n• Real results, zero hassle. See what ${brand} can do for you.\n\n(Demo output — add your Anthropic API key for live Claude generation.)`,
  },
};
