-- Seed data for TyloTech Hub demo. Run after 0001_init.sql.
-- Note: `users` rows must reference real auth.users ids — create those via
-- Supabase Auth first, then insert matching rows here.

insert into clients (id, name, company, primary_color, secondary_color, plan, mrr) values
  ('11111111-1111-1111-1111-111111111111', 'Nordic Estate', 'Nordic Estate', '#38BDF8', '#0C141C', 'Scale', 6800),
  ('22222222-2222-2222-2222-222222222222', 'Velform Fitness', 'Velform Fitness', '#F43F5E', '#1A0E12', 'Growth', 4200),
  ('33333333-3333-3333-3333-333333333333', 'Altan Legal', 'Altan Legal', '#34D399', '#0E1714', 'Enterprise', 9500)
on conflict (id) do nothing;

insert into ai_tools (name, slug, description, category, is_active, prompt_template) values
  ('Content Generator', 'content-generator', 'Generate social posts, captions and blog drafts in your brand voice.', 'Content', true,
   'You are a senior social media copywriter. Brand: {{brand}}. Topic: {{topic}}. Write 3 on-brand post variations.'),
  ('Ad Copy Generator', 'ad-copy', 'Meta & Google ad variations engineered to convert.', 'Ads', true,
   'You are a direct-response marketer. Brand: {{brand}}. Product: {{product}}. Generate Meta + Google ad copy.'),
  ('SEO Analyzer', 'seo-analyzer', 'Analyze any URL or keyword and get prioritized fixes.', 'SEO', true,
   'Analyze {{url}} for SEO and return prioritized, actionable recommendations.')
on conflict (slug) do nothing;

insert into kpis (client_id, metric_name, label, value, unit, delta, period, source) values
  ('11111111-1111-1111-1111-111111111111', 'ad_spend', 'Monthly Ad Spend', 18400, 'currency', 12.4, 'Jun 2026', 'Meta Ads'),
  ('11111111-1111-1111-1111-111111111111', 'leads', 'Leads Generated', 342, 'number', 23.1, 'Jun 2026', 'Meta Ads'),
  ('11111111-1111-1111-1111-111111111111', 'cpl', 'Cost Per Lead', 53.8, 'currency', -8.6, 'Jun 2026', 'Google Ads'),
  ('11111111-1111-1111-1111-111111111111', 'roas', 'ROAS', 4.7, 'ratio', 0.6, 'Jun 2026', 'Meta Ads');
