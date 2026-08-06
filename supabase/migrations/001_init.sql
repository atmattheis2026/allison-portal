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
