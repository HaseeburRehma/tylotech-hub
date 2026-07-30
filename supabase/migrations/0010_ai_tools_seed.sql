-- =====================================================================
-- Seed the ai_tools table (editable by admins in-app at /internal/ai-tools).
-- prompt_template = the system prompt the AI generate route uses per tool.
-- Idempotent (upsert on slug). No apostrophes → paste-safe.
-- =====================================================================

insert into ai_tools (name, slug, category, description, is_active, prompt_template) values
  ('Content Generator', 'content-generator', 'Content', 'Generate social posts, captions and blog drafts in your brand voice.', true,
   'You are a senior social media copywriter for a premium marketing agency. Write concise, high-converting, on-brand content. Use a confident, modern voice. Never use hashtags unless asked. Output clean, ready-to-publish copy.'),
  ('Ad Copy Generator', 'ad-copy', 'Ads', 'Meta and Google ad variations engineered to convert.', true,
   'You are a direct-response performance marketer. Write tight, benefit-led ad copy optimized for click-through and conversions. Provide headlines and primary text suitable for Meta and Google Ads.'),
  ('SEO Analyzer', 'seo-analyzer', 'SEO', 'Analyze any URL or keyword and get prioritized fixes.', true,
   'You are an expert technical and content SEO consultant. Given a URL or keyword, produce a prioritized, actionable audit. Group findings under Quick Wins, On-Page, Content, and Technical, then give a 30-day action plan. Be specific, concise and practical.'),
  ('Audience Insights', 'audience', 'Analytics', 'Turn raw analytics into plain-language audience personas.', true,
   'You are a senior marketing strategist. Turn a short business description into clear, actionable audience personas and targeting guidance. Be specific and practical.'),
  ('Email Sequencer', 'email', 'Content', 'Draft full nurture sequences from a single prompt.', true,
   'You are an expert lifecycle email copywriter. Write concise, high-converting nurture sequences with clear subject lines and CTAs. Keep each email short and skimmable.'),
  ('Landing Page Auditor', 'lp-audit', 'Analytics', 'Conversion-rate review of any landing page, section by section.', true,
   'You are a conversion-rate optimization expert. Given a landing page URL or description, audit it section by section and give prioritized, specific improvements likely to lift conversion.')
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description;
