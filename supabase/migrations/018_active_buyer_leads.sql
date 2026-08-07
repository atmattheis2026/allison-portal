-- Active-buyer leads: a lighter portal for clients who are still house hunting,
-- before there's a contract (and therefore before there's a Transaction row).
--
-- Deliberately its own set of tables rather than reusing transactions/
-- milestones/contacts — a lead has no address, no closing date, no loan side,
-- and no checklist. Forcing it into the transaction shape would mean a pile of
-- nullable columns that don't apply until conversion.
--
-- Visibility mirrors transactions (migration 005): each agent sees their own
-- leads, and sees_all_transactions overrides that. There's no assignees join
-- table like transactions has, since a lead only ever has one agent
-- (realtor_member_id) rather than a team of people working it.

create table leads (
  id                     uuid primary key default gen_random_uuid(),
  team_id                uuid not null references teams(id) on delete cascade,
  share_token            uuid not null unique default gen_random_uuid(),

  full_name              text not null default '',
  phone                  text,
  email                  text,

  realtor_member_id      uuid references team_members(id) on delete set null,

  -- Compliance tracking, internal only — not part of get_shared_lead().
  -- Required before showing homes; tracked here because a lead is exactly
  -- the pre-contract window where this matters.
  buyer_broker_signed    boolean not null default false,
  buyer_broker_expires   date,

  -- Open space for whatever doesn't fit the structured sections below.
  -- Internal only — not part of get_shared_lead().
  general_notes          text,

  -- Set once this lead goes under contract and gets promoted to a real
  -- transaction. Kept around (not deleted) so the history isn't lost.
  converted_transaction_id uuid references transactions(id) on delete set null,

  created_at             timestamptz not null default now(),
  archived_at            timestamptz
);
create index on leads (team_id, archived_at);

create table lead_appointments (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references leads(id) on delete cascade,
  scheduled_at   timestamptz,
  address_line   text not null default '',
  note           text,
  sort_order     int not null default 0
);
create index on lead_appointments (lead_id, sort_order);

create table lead_homes (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references leads(id) on delete cascade,
  address_line   text not null default '',
  city_state_zip text,
  price          text,
  url            text,
  note           text,
  sort_order     int not null default 0
);
create index on lead_homes (lead_id, sort_order);

-- Buyer's wants/needs, ranked — top of the list is the highest priority.
create table lead_priorities (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references leads(id) on delete cascade,
  text           text not null default '',
  sort_order     int not null default 0
);
create index on lead_priorities (lead_id, sort_order);

-- Same shape as transactions' notes — a dated log, client-visible, one side
-- only (a lead has no loan side yet).
create table lead_notes (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references leads(id) on delete cascade,
  author_name    text,
  body           text not null,
  created_at     timestamptz not null default now()
);
create index on lead_notes (lead_id, created_at);

-- ---------------------------------------------------------------- RLS

alter table leads              enable row level security;
alter table lead_appointments  enable row level security;
alter table lead_homes         enable row level security;
alter table lead_priorities    enable row level security;
alter table lead_notes         enable row level security;

-- Same per-person visibility as transactions (migration 005): this is meant
-- for each agent to track their own leads, not a shared team pool. Someone
-- with sees_all_transactions (the office-manager switch in Settings > Team)
-- sees every lead too; everyone else sees only the ones they're the agent on.
-- Creating/editing stays team-wide, same reasoning as transactions — the
-- switch is about day-to-day visibility, not who's allowed to manage things.
create policy lead_select on leads for select to authenticated
  using (
    team_id = my_team_id()
    and (
      exists (
        select 1 from team_members m
         where m.profile_id = auth.uid() and m.sees_all_transactions
      )
      or exists (
        select 1 from team_members m
         where m.id = leads.realtor_member_id and m.profile_id = auth.uid()
      )
    )
  );
create policy lead_insert on leads for insert to authenticated
  with check (team_id = my_team_id());
create policy lead_update on leads for update to authenticated
  using (team_id = my_team_id()) with check (team_id = my_team_id());
create policy lead_delete on leads for delete to authenticated
  using (team_id = my_team_id());

-- Lead children: reachable only through a lead you can see (same
-- security-definer trick as transaction_team_id(), for the same reason —
-- avoids RLS recursion — but mirrors leads' per-agent visibility rather than
-- just team membership).
create or replace function lead_visible(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from leads l
     where l.id = p_lead_id
       and l.team_id = my_team_id()
       and (
         exists (select 1 from team_members m
                  where m.profile_id = auth.uid() and m.sees_all_transactions)
         or exists (select 1 from team_members m
                     where m.id = l.realtor_member_id and m.profile_id = auth.uid())
       )
  )
$$;

do $$
declare t text;
begin
  foreach t in array array['lead_appointments','lead_homes','lead_priorities','lead_notes']
  loop
    execute format($f$
      create policy lead_child_rw on %I for all to authenticated
        using (lead_visible(%I.lead_id))
        with check (lead_visible(%I.lead_id));
    $f$, t, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- client share

-- Mirrors get_shared_transaction(): the only thing an anonymous visitor can
-- call for a lead. general_notes is deliberately excluded — that field is
-- Allison's own scratch space, not client-facing.
create or replace function get_shared_lead(p_token uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_lead leads;
  v_result jsonb;
begin
  select * into v_lead from leads
   where share_token = p_token and archived_at is null;

  if v_lead.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'lead', jsonb_build_object(
      'id', v_lead.id,
      'full_name', v_lead.full_name
    ),
    'realtor', (
      select jsonb_build_object('full_name', m.full_name, 'license_number', m.license_number,
                                'headshot_url', m.headshot_url, 'phone', m.phone, 'email', m.email)
        from team_members m where m.id = v_lead.realtor_member_id
    ),
    'brand', (
      select jsonb_build_object('name', b.name, 'wordmark_text', b.wordmark_text,
               'logo_url', b.logo_url, 'logo_light_url', b.logo_light_url,
               'accent_hex', b.accent_hex, 'needs_light_background', b.needs_light_background)
        from brands b where b.team_id = v_lead.team_id and b.kind = 'real_estate'
    ),
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'scheduled_at', a.scheduled_at,
               'address_line', a.address_line, 'note', a.note)
               order by a.sort_order)
        from lead_appointments a where a.lead_id = v_lead.id
    ), '[]'::jsonb),
    'homes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', h.id, 'address_line', h.address_line, 'city_state_zip', h.city_state_zip,
               'price', h.price, 'url', h.url, 'note', h.note)
               order by h.sort_order)
        from lead_homes h where h.lead_id = v_lead.id
    ), '[]'::jsonb),
    'priorities', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'text', p.text) order by p.sort_order)
        from lead_priorities p where p.lead_id = v_lead.id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'author_name', n.author_name, 'body', n.body, 'created_at', n.created_at)
               order by n.created_at desc)
        from lead_notes n where n.lead_id = v_lead.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function get_shared_lead(uuid) from public;
grant execute on function get_shared_lead(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- conversion

-- Promotes a lead to a real transaction once it goes under contract. Address
-- ships blank — she fills that in on the new transaction page along with
-- everything else a Transaction needs that a Lead doesn't track (closing
-- date, milestones, documents). Carries over what it can (buyer's own
-- contact info, assigned agent) so she isn't retyping what's already on
-- file. Guarded the same way seed_transaction() is: refuses to touch a lead
-- outside the caller's team.
create or replace function convert_lead_to_transaction(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead leads;
  v_tx_id uuid;
begin
  select * into v_lead from leads where id = p_lead_id;
  if v_lead.id is null then
    raise exception 'lead % not found', p_lead_id;
  end if;
  if v_lead.team_id is distinct from my_team_id() then
    raise exception 'not your lead';
  end if;
  if v_lead.converted_transaction_id is not null then
    return v_lead.converted_transaction_id;
  end if;

  insert into transactions (team_id, deal_type, realtor_member_id)
  values (v_lead.team_id, 'buy', v_lead.realtor_member_id)
  returning id into v_tx_id;

  perform seed_transaction(v_tx_id);
  perform apply_rail_steps(v_tx_id);

  -- seed_transaction() already inserted a blank "Buyers" contact row from
  -- the team's contact_templates — fill it in rather than adding a second one.
  update contacts
     set name = nullif(v_lead.full_name, ''), phone = v_lead.phone, email = v_lead.email
   where transaction_id = v_tx_id and role_label = 'Buyers';

  if v_lead.realtor_member_id is not null then
    insert into transaction_assignees (transaction_id, team_member_id)
    values (v_tx_id, v_lead.realtor_member_id)
    on conflict do nothing;
  end if;

  update leads set converted_transaction_id = v_tx_id, archived_at = now()
   where id = p_lead_id;

  return v_tx_id;
end;
$$;

revoke all on function convert_lead_to_transaction(uuid) from public;
grant execute on function convert_lead_to_transaction(uuid) to authenticated;
