-- =====================================================================
-- App Store / Play review account: a FICTIONAL client with sample data
-- (never a real partner — GDPR). Run in the Supabase SQL editor. Re-runnable:
-- resets the demo client's sample content each time.
--
--   Login:    app-review@tylotech.de
--   Password: put it in place of CHANGE_ME below (it lives in
--             tylohq-mobile/.env.local → STORE_REVIEW_PASSWORD; never commit it).
--             If the account already exists and you leave CHANGE_ME, the
--             current password is kept.
--   Client:   "Musterbad GmbH", slug demo-musterbad (the "demo-" prefix keeps
--             it out of the staff dashboard totals).
--
-- Documents: the rows point at <client id>/demo-{report,contract,invoice}.pdf
-- in the private "documents" bucket. Storage files can't be written from SQL;
-- if they're missing, the list still shows but downloads fail — upload any PDF
-- under those names (Storage → documents) to fix.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  pw       text := 'CHANGE_ME';
  v_email  text := 'app-review@tylotech.de';
  v_slug   text := 'demo-musterbad';
  v_cid    uuid;
  v_uid    uuid;
  v_staff  uuid;
begin
  -- 1) the fictional client
  select id into v_cid from public.clients where slug = v_slug;
  if v_cid is null then
    insert into public.clients (name, company, slug, plan, mrr, primary_color, secondary_color)
    values ('App Review Demo', 'Musterbad GmbH', v_slug, 'Growth', 0, '#D1AA71', '#0F0E0D')
    returning id into v_cid;
  end if;

  -- 2) the login (auth.users + identity) and its client profile
  select id into v_uid from auth.users where email = v_email;
  if v_uid is null then
    if pw = 'CHANGE_ME' then
      raise exception 'Set the review password in place of CHANGE_ME before creating the account.';
    end if;
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, extensions.crypt(pw, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', 'Lena Hoffmann', 'role', 'client'),
      '', '', '', ''
    );
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_uid::text, v_uid, jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  else
    update auth.users
       set email_confirmed_at = coalesce(email_confirmed_at, now()),
           encrypted_password = case when pw = 'CHANGE_ME' then encrypted_password else extensions.crypt(pw, extensions.gen_salt('bf')) end,
           banned_until = null,
           updated_at = now()
     where id = v_uid;
  end if;

  insert into public.users (id, client_id, email, name, role)
  values (v_uid, v_cid, v_email, 'Lena Hoffmann', 'client')
  on conflict (id) do update
    set client_id = excluded.client_id, email = excluded.email, name = excluded.name, role = excluded.role;

  -- 3) the TyloTech side of the sample chat
  select id into v_staff from public.users where email = 'dev@tylotech.de' and role in ('admin', 'team');

  -- 4) reset the sample content
  delete from public.kpis          where client_id = v_cid;
  delete from public.metric_points where client_id = v_cid;
  delete from public.projects      where client_id = v_cid;
  delete from public.updates       where client_id = v_cid;
  delete from public.messages      where client_id = v_cid;
  delete from public.documents     where client_id = v_cid;
  delete from public.notifications where user_id = v_uid;

  insert into public.kpis (client_id, metric_name, label, value, unit, delta, period, source) values
    (v_cid, 'ad_spend',      'Werbebudget',     2480,  'currency', 12.4, '30 Tage', 'Manual'),
    (v_cid, 'leads',         'Leads',           64,    'number',   18.5, '30 Tage', 'Manual'),
    (v_cid, 'cost_per_lead', 'Kosten pro Lead', 38.75, 'currency', -5.2, '30 Tage', 'Manual'),
    (v_cid, 'appointments',  'Termine',         18,    'number',    9.1, '30 Tage', 'Manual');

  -- 60 days of Meta + Google numbers for the performance charts
  insert into public.metric_points (client_id, date, provider, spend, leads, roas)
  select v_cid, current_date - i, 'meta_ads',
         round((58 * (1 + 0.35 * sin(i / 4.0) + (59 - i) / 120.0))::numeric, 2),
         greatest(0, round(1.4 * (1 + 0.35 * sin(i / 4.0) + (59 - i) / 120.0) + cos(i / 3.0)))::int,
         round((3 + sin(i / 5.0) * 0.6)::numeric, 2)
    from generate_series(0, 59) as i
  union all
  select v_cid, current_date - i, 'google_ads',
         round((26 * (1 + 0.35 * sin(i / 4.0) + (59 - i) / 120.0))::numeric, 2),
         greatest(0, round(0.6 * (1 + 0.35 * sin(i / 4.0) + (59 - i) / 120.0) + sin(i / 2.0)))::int,
         round((2.4 + cos(i / 6.0) * 0.5)::numeric, 2)
    from generate_series(0, 59) as i;

  insert into public.projects (client_id, name, description, status, progress, assigned_to, due) values
    (v_cid, 'Badsanierung-Kampagne Herbst', 'Meta & Google, 5 Anzeigenvarianten', 'in_progress', 62,  'TyloTech Team', current_date + 6),
    (v_cid, 'Landingpage-Relaunch',         'Neue Seite mit Terminbuchung',      'review',      85,  'TyloTech Team', current_date + 3),
    (v_cid, 'Google-Ads-Konto Setup',       'Konten, Conversions, Budgets',      'planning',    10,  'TyloTech Team', current_date + 14),
    (v_cid, 'Search-Console-Anbindung',     'Daten fließen ins Dashboard',       'done',        100, 'TyloTech Team', current_date - 4);

  insert into public.updates (client_id, title, description, type, created_at) values
    (v_cid, 'Herbstkampagne ist live',  'Fünf neue Anzeigen laufen auf Facebook und Instagram.', 'campaign',  now() - interval '20 hours'),
    (v_cid, 'Monatsbericht September',  'Der Bericht liegt unter Dokumente bereit.',             'report',    now() - interval '70 hours'),
    (v_cid, 'Search Console verbunden', 'Organische Klicks erscheinen jetzt im Dashboard.',      'milestone', now() - interval '140 hours');

  if v_staff is not null then
    insert into public.messages (client_id, sender_id, sender_name, sender_role, content, created_at) values
      (v_cid, v_staff, 'TyloTech Team', 'team',   'Guten Morgen Lena! Die Herbstkampagne ist seit heute früh live.', now() - interval '26 hours'),
      (v_cid, v_uid,   'Lena Hoffmann', 'client', 'Super, danke! Können wir das Budget für Instagram etwas erhöhen?', now() - interval '25 hours'),
      (v_cid, v_staff, 'TyloTech Team', 'team',   'Gern – wir gehen ab morgen auf 40 € pro Tag. Den Entwurf für die neue Landingpage findest du unter Projekte.', now() - interval '24 hours'),
      (v_cid, v_uid,   'Lena Hoffmann', 'client', 'Perfekt, schaue ich mir heute Nachmittag an 👍', now() - interval '3 hours');
  end if;

  insert into public.documents (client_id, name, file_url, type, size) values
    (v_cid, 'Monatsbericht September 2026.pdf', v_cid || '/demo-report.pdf',   'report',   '1 KB'),
    (v_cid, 'Rahmenvertrag 2026.pdf',           v_cid || '/demo-contract.pdf', 'contract', '1 KB'),
    (v_cid, 'Rechnung 2026-0142.pdf',           v_cid || '/demo-invoice.pdf',  'invoice',  '1 KB');

  insert into public.notifications (user_id, title, body, href, read, type, created_at) values
    (v_uid, 'Neue Nachricht von TyloTech', 'Gern – wir gehen ab morgen auf 40 € pro Tag.', '/chat', false, 'message', now() - interval '24 hours'),
    (v_uid, 'Neues Dokument: Monatsbericht September 2026', 'Der Bericht ist jetzt verfügbar.', '/documents', false, 'update', now() - interval '70 hours');

  raise notice 'Review demo ready: client % (%), login %', v_slug, v_cid, v_email;
end;
$$;
