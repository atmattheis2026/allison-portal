-- Combined reset + setup script: run this once in the Supabase SQL Editor.
-- Wipes the app's own tables (test data only, nothing real yet) and rebuilds
-- everything fresh, in the correct order.

-- ============================================================
-- RESET_PREAMBLE.sql
-- ============================================================

-- One-time reset for Allison's live project.
--
-- Her database so far only has test data (one throwaway transaction, no real
-- clients) built from an earlier, incomplete version of the schema. Dixon's
-- work (seller checklists, disclaimers, real first-run setup) needs to be
-- added, plus a fix for a policy bug found while testing. Rather than hand-
-- reconcile three divergent migration histories against a live database, this
-- drops just the app's own tables and policies (nothing Supabase itself
-- manages) so the full, correct migration set can run against a clean slate.

drop policy if exists media_public_read on storage.objects;
drop policy if exists media_team_write on storage.objects;
drop policy if exists media_team_update on storage.objects;
drop policy if exists media_team_delete on storage.objects;

drop table if exists transaction_assignees cascade;
drop table if exists contacts cascade;
drop table if exists doc_lines cascade;
drop table if exists milestones cascade;
drop table if exists transactions cascade;
drop table if exists contact_templates cascade;
drop table if exists doc_line_templates cascade;
drop table if exists milestone_templates cascade;
drop table if exists saved_lenders cascade;
drop table if exists team_members cascade;
drop table if exists profiles cascade;
drop table if exists brands cascade;
drop table if exists teams cascade;

drop trigger if exists on_auth_user_created on auth.users;

-- ============================================================
-- migrations/001_init.sql
-- ============================================================

-- Allison Mattheis transaction portal — initial schema
--
-- Design notes for whoever reads this next (including Allison's Claude):
--  * Checklist items are ROWS, not columns. Her list will change. Adding a step
--    is an insert, never a migration.
--  * milestone_templates is what makes the seller checklist self-serve. She edits
--    a template in the UI; new transactions get stamped from it.
--  * Clients never touch these tables. They call get_shared_transaction(token),
--    which is SECURITY DEFINER. Anon has EXECUTE on that and nothing else.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- teams & brands

create table teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Two brands per team: the real estate company and the lending company.
-- She uploads both logos herself in Settings, so this ships empty and usable.
create table brands (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  kind          text not null check (kind in ('real_estate','lending')),
  name          text not null default '',
  wordmark_text text not null default '',           -- fallback when no logo yet
  logo_url      text,                                -- logo for DARK backgrounds
  logo_light_url text,                               -- optional, for the light-band fallback
  accent_hex    text not null default '#C9A44C',
  needs_light_background boolean not null default false,  -- brand rules may forbid dark
  created_at    timestamptz not null default now(),
  unique (team_id, kind)
);

-- ---------------------------------------------------------------- people

create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  team_id        uuid references teams(id) on delete set null,
  full_name      text not null default '',
  role           text not null default 'realtor' check (role in ('realtor','loan_officer','admin')),
  license_number text,
  headshot_url   text,
  phone          text,
  email          text,
  created_at     timestamptz not null default now()
);

-- Team members who are not app users yet still appear on transactions.
-- Her five people can exist here before any of them ever logs in.
create table team_members (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references teams(id) on delete cascade,
  profile_id     uuid references profiles(id) on delete set null,
  full_name      text not null,
  license_number text,
  headshot_url   text,
  phone          text,
  email          text,
  sort_order     int not null default 0
);

-- Lenders are per-transaction (her team may not use her as lender), but saving
-- them means she picks instead of retyping.
create table saved_lenders (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references teams(id) on delete cascade,
  full_name      text not null,
  company        text,
  license_number text,
  headshot_url   text,
  phone          text,
  email          text,
  is_in_house    boolean not null default false,   -- true = her own lending company
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- templates

-- The editable master checklists. Seeded with her buyer list; the seller list
-- starts empty and she builds it in the UI.
create table milestone_templates (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  deal_type  text not null check (deal_type in ('buy','sell')),
  side       text not null check (side in ('real_estate','loan')),
  label      text not null,
  has_date   boolean not null default false,
  sort_order int  not null default 0
);

create table doc_line_templates (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  group_key  text not null check (group_key in ('documentation','conditions')),
  blank_count int not null default 6
);

create table contact_templates (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  group_key  text not null check (group_key in ('people','utilities')),
  role_label text not null,
  sort_order int not null default 0
);

-- ---------------------------------------------------------------- transactions

create table transactions (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  share_token   uuid not null unique default gen_random_uuid(),
  deal_type     text not null default 'buy' check (deal_type in ('buy','sell')),

  address_line  text not null default '',
  city_state_zip text not null default '',
  photo_url     text,

  status        text not null default 'under_contract'
                check (status in ('under_contract','on_track','attention','closed','fell_through')),
  status_note   text,
  closing_date  date,                              -- drives the countdown

  realtor_member_id uuid references team_members(id) on delete set null,

  -- Lender lives on the transaction, not the team.
  lender_name        text,
  lender_company     text,
  lender_license     text,
  lender_headshot_url text,
  lender_phone       text,
  lender_email       text,
  lender_is_in_house boolean not null default false,

  created_at    timestamptz not null default now(),
  archived_at   timestamptz
);

create index on transactions (team_id, archived_at);

create table milestones (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  side           text not null check (side in ('real_estate','loan')),
  label          text not null,
  has_date       boolean not null default false,
  date_value     date,
  is_complete    boolean not null default false,
  completed_at   timestamptz,
  sort_order     int not null default 0,
  internal_only  boolean not null default false,   -- unused in v1; here so a
                                                    -- future private note is a UI change
  is_rail_step   boolean not null default false,   -- shows on the progress rail
  rail_label     text
);
create index on milestones (transaction_id, side, sort_order);

create table doc_lines (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  group_key      text not null check (group_key in ('documentation','conditions')),
  text           text not null default '',
  is_checked     boolean not null default false,
  sort_order     int not null default 0
);
create index on doc_lines (transaction_id, group_key, sort_order);

create table contacts (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  group_key      text not null check (group_key in ('people','utilities')),
  role_label     text not null,
  name           text,
  phone          text,
  email          text,
  note           text,
  sort_order     int not null default 0
);
create index on contacts (transaction_id, group_key, sort_order);

-- ---------------------------------------------------------------- seeding

-- Stamps a new transaction from the team's templates.
create or replace function seed_transaction(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_deal text;
  v_grp  record;
  i      int;
begin
  select team_id, deal_type into v_team, v_deal
    from transactions where id = p_transaction_id;
  if v_team is null then
    raise exception 'transaction % not found', p_transaction_id;
  end if;

  insert into milestones (transaction_id, side, label, has_date, sort_order,
                          is_rail_step, rail_label)
  select p_transaction_id, t.side, t.label, t.has_date, t.sort_order,
         false, null
    from milestone_templates t
   where t.team_id = v_team and t.deal_type = v_deal
   order by t.side, t.sort_order;

  for v_grp in
    select group_key, blank_count from doc_line_templates where team_id = v_team
  loop
    for i in 1 .. v_grp.blank_count loop
      insert into doc_lines (transaction_id, group_key, text, sort_order)
      values (p_transaction_id, v_grp.group_key, '', i);
    end loop;
  end loop;

  insert into contacts (transaction_id, group_key, role_label, sort_order)
  select p_transaction_id, c.group_key, c.role_label, c.sort_order
    from contact_templates c
   where c.team_id = v_team
   order by c.group_key, c.sort_order;
end;
$$;

-- ---------------------------------------------------------------- client share

-- The only thing an anonymous visitor can call. Returns one transaction as a
-- single JSON payload. No table access is granted to anon anywhere.
create or replace function get_shared_transaction(p_token uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_tx transactions;
  v_result jsonb;
begin
  select * into v_tx from transactions
   where share_token = p_token and archived_at is null;

  if v_tx.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'transaction', jsonb_build_object(
      'id', v_tx.id,
      'deal_type', v_tx.deal_type,
      'address_line', v_tx.address_line,
      'city_state_zip', v_tx.city_state_zip,
      'photo_url', v_tx.photo_url,
      'status', v_tx.status,
      'status_note', v_tx.status_note,
      'closing_date', v_tx.closing_date,
      'lender', jsonb_build_object(
        'name', v_tx.lender_name,
        'company', v_tx.lender_company,
        'license', v_tx.lender_license,
        'headshot_url', v_tx.lender_headshot_url,
        'phone', v_tx.lender_phone,
        'email', v_tx.lender_email,
        'is_in_house', v_tx.lender_is_in_house
      )
    ),
    'realtor', (
      select jsonb_build_object('full_name', m.full_name, 'license_number', m.license_number,
                                'headshot_url', m.headshot_url, 'phone', m.phone, 'email', m.email)
        from team_members m where m.id = v_tx.realtor_member_id
    ),
    'brands', coalesce((
      select jsonb_object_agg(b.kind, jsonb_build_object(
               'name', b.name, 'wordmark_text', b.wordmark_text,
               'logo_url', b.logo_url, 'logo_light_url', b.logo_light_url,
               'accent_hex', b.accent_hex,
               'needs_light_background', b.needs_light_background))
        from brands b where b.team_id = v_tx.team_id
    ), '{}'::jsonb),
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ms.id, 'side', ms.side, 'label', ms.label,
               'has_date', ms.has_date, 'date_value', ms.date_value,
               'is_complete', ms.is_complete, 'sort_order', ms.sort_order,
               'is_rail_step', ms.is_rail_step, 'rail_label', ms.rail_label)
               order by ms.side, ms.sort_order)
        from milestones ms
       where ms.transaction_id = v_tx.id and ms.internal_only = false
    ), '[]'::jsonb),
    'doc_lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'group_key', d.group_key, 'text', d.text,
               'is_checked', d.is_checked, 'sort_order', d.sort_order)
               order by d.group_key, d.sort_order)
        from doc_lines d where d.transaction_id = v_tx.id
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'group_key', c.group_key, 'role_label', c.role_label,
               'name', c.name, 'phone', c.phone, 'email', c.email,
               'note', c.note, 'sort_order', c.sort_order)
               order by c.group_key, c.sort_order)
        from contacts c where c.transaction_id = v_tx.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function get_shared_transaction(uuid) from public;
grant execute on function get_shared_transaction(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- RLS

create or replace function my_team_id()
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from profiles where id = auth.uid()
$$;

alter table teams               enable row level security;
alter table brands              enable row level security;
alter table profiles            enable row level security;
alter table team_members        enable row level security;
alter table saved_lenders       enable row level security;
alter table milestone_templates enable row level security;
alter table doc_line_templates  enable row level security;
alter table contact_templates   enable row level security;
alter table transactions        enable row level security;
alter table milestones          enable row level security;
alter table doc_lines           enable row level security;
alter table contacts            enable row level security;

create policy team_read on teams for select to authenticated
  using (id = my_team_id());

create policy self_rw on profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy teammates_read on profiles for select to authenticated
  using (team_id = my_team_id());

-- Team-scoped tables: same shape for each.
do $$
declare t text;
begin
  foreach t in array array['brands','team_members','saved_lenders',
                           'milestone_templates','doc_line_templates',
                           'contact_templates','transactions']
  loop
    execute format($f$
      create policy team_rw on %I for all to authenticated
        using (team_id = my_team_id()) with check (team_id = my_team_id());
    $f$, t);
  end loop;
end $$;

-- Transaction children: reachable only through a transaction on your team.
do $$
declare t text;
begin
  foreach t in array array['milestones','doc_lines','contacts']
  loop
    execute format($f$
      create policy team_rw on %I for all to authenticated
        using (exists (select 1 from transactions x
                        where x.id = %I.transaction_id and x.team_id = my_team_id()))
        with check (exists (select 1 from transactions x
                        where x.id = %I.transaction_id and x.team_id = my_team_id()));
    $f$, t, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public)
values ('media','media', true)
on conflict (id) do nothing;

create policy media_public_read on storage.objects for select
  using (bucket_id = 'media');
create policy media_team_write on storage.objects for insert to authenticated
  with check (bucket_id = 'media');
create policy media_team_update on storage.objects for update to authenticated
  using (bucket_id = 'media');
create policy media_team_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media');

-- ============================================================
-- migrations/002_seed_templates.sql
-- ============================================================

-- Seeds a team with Allison's buyer checklist, exactly as she sent it Aug 5 2026.
--
-- The SELLER templates are deliberately NOT seeded here (see 003) — this file
-- only carries the buyer side that shipped first.

create or replace function bootstrap_team(p_team_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
begin
  insert into teams (name) values (p_team_name) returning id into v_team;

  -- Two brands, empty. She fills these in Settings > Branding.
  insert into brands (team_id, kind, name, wordmark_text, accent_hex) values
    (v_team, 'real_estate', p_team_name, upper(p_team_name), '#C9A44C'),
    (v_team, 'lending',     '',          'LENDING',          '#7F9CB8');

  -- ---- BUYER: real estate side (her list, in her order) ----
  insert into milestone_templates (team_id, deal_type, side, label, has_date, sort_order) values
    (v_team,'buy','real_estate','Contract day',                          true,  10),
    (v_team,'buy','real_estate','Earnest deposit',                       true,  20),
    (v_team,'buy','real_estate','Inspection date',                       true,  30),
    (v_team,'buy','real_estate','Inspection report & negotiations due',  true,  40),
    (v_team,'buy','real_estate','Appraisal date',                        true,  50),
    (v_team,'buy','real_estate','Appraisal due',                         true,  60),
    (v_team,'buy','real_estate','Estoppel complete',                     false, 70),
    (v_team,'buy','real_estate','Survey date',                           true,  80),
    (v_team,'buy','real_estate','Survey complete',                       false, 90),
    (v_team,'buy','real_estate','Clear to close',                        false,100),
    (v_team,'buy','real_estate','Signing date',                          true, 110),
    (v_team,'buy','real_estate','Final wire sent',                       false,120),
    (v_team,'buy','real_estate','Final walk through',                    false,130),
    (v_team,'buy','real_estate','Funded!!',                              false,140);

  -- ---- BUYER: loan side ----
  insert into milestone_templates (team_id, deal_type, side, label, has_date, sort_order) values
    (v_team,'buy','loan','Application complete',              false, 10),
    (v_team,'buy','loan','Documentation on file',             false, 20),
    (v_team,'buy','loan','Preapproval complete',              false, 30),
    (v_team,'buy','loan','Initial disclosures complete',      false, 40),
    (v_team,'buy','loan','Lock rate',                         false, 50),
    (v_team,'buy','loan','Order appraisal',                   false, 60),
    (v_team,'buy','loan','Order title work',                  false, 70),
    (v_team,'buy','loan','Homeowners insurance set',          false, 80),
    (v_team,'buy','loan','Submitted to underwriting',         false, 90),
    (v_team,'buy','loan','Cleared conditions',                false,100),
    (v_team,'buy','loan','Final underwriting',                false,110),
    (v_team,'buy','loan','Clear to close',                    false,120),
    (v_team,'buy','loan','Closing disclosure signed',         true, 130),
    (v_team,'buy','loan','Balance numbers with title & lender',false,140),
    (v_team,'buy','loan','Closing!',                          false,150);

  insert into doc_line_templates (team_id, group_key, blank_count) values
    (v_team,'documentation',6),
    (v_team,'conditions',6);

  insert into contact_templates (team_id, group_key, role_label, sort_order) values
    (v_team,'people','Buyers',              10),
    (v_team,'people','Sellers',             20),
    (v_team,'people','Realtor',             30),
    (v_team,'people','Loan Officer',        40),
    (v_team,'people','Lender',              50),
    (v_team,'people','Title Company',       60),
    (v_team,'people','Inspector',           70),
    (v_team,'people','Homeowners Insurance',80),
    (v_team,'utilities','Power',    10),
    (v_team,'utilities','Water',    20),
    (v_team,'utilities','Gas',      30),
    (v_team,'utilities','Cable',    40),
    (v_team,'utilities','Internet', 50),
    (v_team,'utilities','HOA',      60);

  return v_team;
end;
$$;

-- Which real-estate steps appear on the progress rail. Applied after seeding so
-- the rail stays in sync with whatever her checklist says.
create or replace function apply_rail_steps(p_transaction_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update milestones set is_rail_step = false where transaction_id = p_transaction_id;

  update milestones m set is_rail_step = true, rail_label = v.rail
    from (values
      ('Contract day','Contract'),
      ('Inspection date','Inspection'),
      ('Appraisal date','Appraisal'),
      ('Clear to close','Clear to close'),
      ('Signing date','Signing'),
      ('Funded!!','Funded')
    ) as v(label, rail)
   where m.transaction_id = p_transaction_id
     and m.side = 'real_estate'
     and m.label = v.label;
end;
$$;

-- ============================================================
-- migrations/003_seller_and_disclaimers.sql
-- ============================================================

-- Allison's seller checklist (texted 2026-08-06) and compliance disclaimers.
--
-- Her seller list has NO loan side at all, which confirms the two-column layout
-- for listings. Notably it is not a mirror of the buyer list: it starts before
-- there's a contract (listing agreement, photos, MLS go-live, open house) and it
-- includes 'provide utilities to buyer', which is the seller handing over the
-- utility info the buyer's page displays.

create or replace function seed_seller_templates(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from milestone_templates
   where team_id = p_team and deal_type = 'sell';

  insert into milestone_templates (team_id, deal_type, side, label, has_date, sort_order) values
    (p_team,'sell','real_estate','Listing agreement',            true,  10),
    (p_team,'sell','real_estate','Photos',                       true,  20),
    (p_team,'sell','real_estate','MLS go-live',                  true,  30),
    (p_team,'sell','real_estate','Open house',                   true,  40),
    (p_team,'sell','real_estate','Contract agreement',           true,  50),
    (p_team,'sell','real_estate','Earnest deposit due',          true,  60),
    (p_team,'sell','real_estate','Earnest deposit received',     false, 70),
    (p_team,'sell','real_estate','Inspection scheduled',         true,  80),
    (p_team,'sell','real_estate','Inspection due',               true,  90),
    (p_team,'sell','real_estate','Estoppel ordered and cleared', false,100),
    (p_team,'sell','real_estate','Appraisal scheduled',          true, 110),
    (p_team,'sell','real_estate','Appraisal due',                true, 120),
    (p_team,'sell','real_estate','Buyers clear to close',        false,130),
    (p_team,'sell','real_estate','Provide utilities to buyer',   false,140),
    (p_team,'sell','real_estate','Signing scheduled',            true, 150),
    (p_team,'sell','real_estate','Funded!',                      false,160);
  -- No 'sell'/'loan' rows on purpose: the Loan section disappears on listings.
end;
$$;

-- Backfill every existing team.
do $$
declare t uuid;
begin
  for t in select id from teams loop
    perform seed_seller_templates(t);
  end loop;
end $$;

-- Fold it into new-team bootstrap.
create or replace function bootstrap_team_v2(p_team_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_team uuid;
begin
  v_team := bootstrap_team(p_team_name);
  perform seed_seller_templates(v_team);
  return v_team;
end;
$$;

-- ---------------------------------------------------------------- rail steps

-- Rail labels now depend on deal type. Buyer and seller journeys have different
-- shapes, so they get different six-step summaries.
create or replace function apply_rail_steps(p_transaction_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_deal text;
begin
  select deal_type into v_deal from transactions where id = p_transaction_id;

  update milestones set is_rail_step = false, rail_label = null
   where transaction_id = p_transaction_id;

  if v_deal = 'sell' then
    update milestones m set is_rail_step = true, rail_label = v.rail
      from (values
        ('Listing agreement',    'Listed'),
        ('MLS go-live',          'Live'),
        ('Contract agreement',   'Under contract'),
        ('Inspection due',       'Inspection'),
        ('Buyers clear to close','Clear to close'),
        ('Funded!',              'Sold')
      ) as v(label, rail)
     where m.transaction_id = p_transaction_id
       and m.side = 'real_estate' and m.label = v.label;
  else
    update milestones m set is_rail_step = true, rail_label = v.rail
      from (values
        ('Contract day',   'Contract'),
        ('Inspection date','Inspection'),
        ('Appraisal date', 'Appraisal'),
        ('Clear to close', 'Clear to close'),
        ('Signing date',   'Signing'),
        ('Funded!!',       'Funded')
      ) as v(label, rail)
     where m.transaction_id = p_transaction_id
       and m.side = 'real_estate' and m.label = v.label;
  end if;
end;
$$;

-- ---------------------------------------------------------------- disclaimers

-- "There's also some disclaimers I need to have checked for the bottom of the
-- doc" — Allison, 2026-08-06. Real estate and lending have separate required
-- language (brokerage identification, Equal Housing, NMLS numbers), so each
-- brand carries its own and both render in the footer.
--
-- These ship EMPTY. Do not pre-fill compliance text — hers has to be approved by
-- her brokerage and her lender, and inventing plausible-looking legal language
-- is worse than showing nothing.

alter table brands add column if not exists disclaimer_text text;

-- Republish the client payload with the disclaimer included.
create or replace function get_shared_transaction(p_token uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_tx transactions;
  v_result jsonb;
begin
  select * into v_tx from transactions
   where share_token = p_token and archived_at is null;

  if v_tx.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'transaction', jsonb_build_object(
      'id', v_tx.id,
      'deal_type', v_tx.deal_type,
      'address_line', v_tx.address_line,
      'city_state_zip', v_tx.city_state_zip,
      'photo_url', v_tx.photo_url,
      'status', v_tx.status,
      'status_note', v_tx.status_note,
      'closing_date', v_tx.closing_date,
      'lender', jsonb_build_object(
        'name', v_tx.lender_name,
        'company', v_tx.lender_company,
        'license', v_tx.lender_license,
        'headshot_url', v_tx.lender_headshot_url,
        'phone', v_tx.lender_phone,
        'email', v_tx.lender_email,
        'is_in_house', v_tx.lender_is_in_house
      )
    ),
    'realtor', (
      select jsonb_build_object('full_name', m.full_name, 'license_number', m.license_number,
                                'headshot_url', m.headshot_url, 'phone', m.phone, 'email', m.email)
        from team_members m where m.id = v_tx.realtor_member_id
    ),
    'brands', coalesce((
      select jsonb_object_agg(b.kind, jsonb_build_object(
               'name', b.name, 'wordmark_text', b.wordmark_text,
               'logo_url', b.logo_url, 'logo_light_url', b.logo_light_url,
               'accent_hex', b.accent_hex,
               'needs_light_background', b.needs_light_background,
               'disclaimer_text', b.disclaimer_text))
        from brands b where b.team_id = v_tx.team_id
    ), '{}'::jsonb),
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ms.id, 'side', ms.side, 'label', ms.label,
               'has_date', ms.has_date, 'date_value', ms.date_value,
               'is_complete', ms.is_complete, 'sort_order', ms.sort_order,
               'is_rail_step', ms.is_rail_step, 'rail_label', ms.rail_label)
               order by ms.side, ms.sort_order)
        from milestones ms
       where ms.transaction_id = v_tx.id and ms.internal_only = false
    ), '[]'::jsonb),
    'doc_lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'group_key', d.group_key, 'text', d.text,
               'is_checked', d.is_checked, 'sort_order', d.sort_order)
               order by d.group_key, d.sort_order)
        from doc_lines d where d.transaction_id = v_tx.id
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'group_key', c.group_key, 'role_label', c.role_label,
               'name', c.name, 'phone', c.phone, 'email', c.email,
               'note', c.note, 'sort_order', c.sort_order)
               order by c.group_key, c.sort_order)
        from contacts c where c.transaction_id = v_tx.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function get_shared_transaction(uuid) from public;
grant execute on function get_shared_transaction(uuid) to anon, authenticated;

-- ============================================================
-- migrations/004_signup_and_claim.sql
-- ============================================================

-- First-run setup: turn a brand-new Supabase project into a working workspace.
--
-- Without this, signing in produces an auth user with no `profiles` row, so
-- my_team_id() returns null and every RLS policy denies everything. The app
-- would look broken in a way that's very hard for a non-technical person to
-- diagnose ("it just says no transactions").

-- ---------------------------------------------------------------- profile on signup

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Anyone who signed up before this trigger existed.
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
 left join public.profiles p on p.id = u.id
 where p.id is null;

-- ---------------------------------------------------------------- claim workspace

-- Run once by the first user. Creates the team, both brands, and every template
-- (buyer + seller), then attaches the caller to it as the first team member.
--
-- Guarded: it refuses if the caller already belongs to a team, so it can't be
-- replayed to spawn duplicates or used to jump into someone else's workspace.
create or replace function claim_workspace(p_team_name text, p_your_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_team uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to set up a workspace.';
  end if;

  select team_id into v_team from profiles where id = v_uid;
  if v_team is not null then
    return jsonb_build_object('team_id', v_team, 'created', false,
                              'message', 'This account is already set up.');
  end if;

  v_team := bootstrap_team(p_team_name);   -- team, brands, buyer templates,
                                           -- doc lines, contact rows
  perform seed_seller_templates(v_team);   -- her listing checklist

  update profiles
     set team_id   = v_team,
         role      = 'admin',
         full_name = coalesce(nullif(p_your_name, ''), full_name)
   where id = v_uid;

  insert into team_members (team_id, profile_id, full_name, email, sort_order)
  select v_team, v_uid,
         coalesce(nullif(p_your_name, ''), nullif(p.full_name, ''), 'Me'),
         p.email, 0
    from profiles p where p.id = v_uid;

  return jsonb_build_object('team_id', v_team, 'created', true,
                            'message', 'Workspace ready.');
end;
$$;

revoke all on function claim_workspace(text, text) from public;
grant execute on function claim_workspace(text, text) to authenticated;

-- ---------------------------------------------------------------- seeding helpers

-- seed_transaction and apply_rail_steps are called from the app right after a
-- transaction is inserted. They're SECURITY DEFINER, so lock them to signed-in
-- users and make them refuse to touch a transaction outside the caller's team.
create or replace function seed_transaction(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_deal text;
  v_grp  record;
  i      int;
begin
  select team_id, deal_type into v_team, v_deal
    from transactions where id = p_transaction_id;

  if v_team is null then
    raise exception 'transaction % not found', p_transaction_id;
  end if;
  if v_team is distinct from my_team_id() then
    raise exception 'not your transaction';
  end if;

  -- Idempotent: re-running must not double the checklist.
  if exists (select 1 from milestones where transaction_id = p_transaction_id) then
    return;
  end if;

  insert into milestones (transaction_id, side, label, has_date, sort_order)
  select p_transaction_id, t.side, t.label, t.has_date, t.sort_order
    from milestone_templates t
   where t.team_id = v_team and t.deal_type = v_deal
   order by t.side, t.sort_order;

  for v_grp in
    select group_key, blank_count from doc_line_templates where team_id = v_team
  loop
    for i in 1 .. v_grp.blank_count loop
      insert into doc_lines (transaction_id, group_key, text, sort_order)
      values (p_transaction_id, v_grp.group_key, '', i);
    end loop;
  end loop;

  insert into contacts (transaction_id, group_key, role_label, sort_order)
  select p_transaction_id, c.group_key, c.role_label, c.sort_order
    from contact_templates c
   where c.team_id = v_team
   order by c.group_key, c.sort_order;
end;
$$;

revoke all on function seed_transaction(uuid) from public;
revoke all on function apply_rail_steps(uuid) from public;
grant execute on function seed_transaction(uuid)  to authenticated;
grant execute on function apply_rail_steps(uuid) to authenticated;

-- bootstrap_team and seed_seller_templates are only ever reached through
-- claim_workspace, which does its own guarding. Nothing else may call them.
revoke all on function bootstrap_team(text) from public, anon, authenticated;
revoke all on function seed_seller_templates(uuid) from public, anon, authenticated;

-- ============================================================
-- migrations/005_team_assignments.sql
-- ============================================================

-- Per-person transaction visibility.
--
-- Design notes for whoever reads this next (including Allison's Claude):
--  * team_members.sees_all_transactions is the office-manager switch — Allison
--    flips it per person in Settings > Team. Everyone else only sees deals
--    they're explicitly assigned to.
--  * transaction_assignees is a plain join table: one row per (transaction,
--    team member) pairing. Assignment happens on the transaction's own page.
--  * This does NOT touch get_shared_transaction() or anon access at all — it
--    only changes what a *signed-in teammate* can query. The client link is
--    unaffected either way.

alter table team_members
  add column sees_all_transactions boolean not null default false;

create table transaction_assignees (
  transaction_id uuid not null references transactions(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  primary key (transaction_id, team_member_id)
);
create index on transaction_assignees (team_member_id);

alter table transaction_assignees enable row level security;

-- transaction_assignees needs to know its transaction's team WITHOUT going
-- through transactions' own RLS. If it queried transactions directly, and
-- transactions' own SELECT policy (below) queries transaction_assignees back,
-- Postgres re-evaluates both policies forever ("infinite recursion detected
-- in policy"). This small security-definer function breaks that cycle, same
-- trick my_team_id() already uses for profiles.
create or replace function transaction_team_id(p_transaction_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from transactions where id = p_transaction_id
$$;

create policy team_rw on transaction_assignees for all to authenticated
  using (transaction_team_id(transaction_assignees.transaction_id) = my_team_id())
  with check (transaction_team_id(transaction_assignees.transaction_id) = my_team_id());

-- Replace the blanket "whole team sees every transaction" policy with:
-- your own team's rows, AND (you see everything OR you're assigned to it).
drop policy if exists team_rw on transactions;

create policy team_select on transactions for select to authenticated
  using (
    team_id = my_team_id()
    and (
      exists (
        select 1 from team_members m
         where m.profile_id = auth.uid() and m.sees_all_transactions
      )
      or exists (
        select 1 from transaction_assignees a
        join team_members m on m.id = a.team_member_id
        where a.transaction_id = transactions.id and m.profile_id = auth.uid()
      )
    )
  );

-- Creating, editing, and archiving stay team-wide — the visibility switch is
-- about who sees a deal day-to-day, not who's allowed to manage the business.
create policy team_insert on transactions for insert to authenticated
  with check (team_id = my_team_id());
create policy team_update on transactions for update to authenticated
  using (team_id = my_team_id()) with check (team_id = my_team_id());
create policy team_delete on transactions for delete to authenticated
  using (team_id = my_team_id());

-- milestones / doc_lines / contacts need no changes: their existing policies
-- check "does a visible row in transactions exist with this id", and that
-- check now runs under the tightened transactions policy above — so a
-- teammate who can't see a transaction can't see its checklist either.
--
-- New column defaults to off for everyone, including whoever just claimed the
-- workspace (claim_workspace predates this column). Flip it on for yourself
-- in Settings > Team after setup — one click, and it's the same switch anyone
-- else on the team uses.
