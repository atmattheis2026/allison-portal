-- Replaces the free-text friends_family_referrals field with a real list of
-- name/phone/email, submittable by either the client themselves (from their
-- read-only page, via a token-scoped RPC — the only write access any client
-- page has ever needed) or the agent (via normal authenticated access, same
-- as every other list on a lead).

alter table leads drop column if exists friends_family_referrals;

create table lead_referrals (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads(id) on delete cascade,
  name          text not null,
  phone         text,
  email         text,
  submitted_by  text not null default 'agent' check (submitted_by in ('agent', 'client')),
  created_at    timestamptz not null default now()
);
create index on lead_referrals (lead_id, created_at);

alter table lead_referrals enable row level security;

-- Agent side: same visibility rule as every other lead child table.
create policy lead_child_rw on lead_referrals for all to authenticated
  using (lead_visible(lead_referrals.lead_id))
  with check (lead_visible(lead_referrals.lead_id));

-- Client side: the token IS the credential, same trust model as
-- get_shared_lead(). Deliberately insert-only — a client can add a referral
-- but can't see, edit, or delete anyone else's (or their own, after the
-- fact). Refuses silently-wrong writes: a made-up token or an archived lead
-- just raises, same as trying to view one.
create or replace function add_lead_referral(p_token uuid, p_name text, p_phone text default null, p_email text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Name is required.';
  end if;

  select id into v_lead_id from leads
   where share_token = p_token and archived_at is null;
  if v_lead_id is null then
    raise exception 'This link is not active.';
  end if;

  insert into lead_referrals (lead_id, name, phone, email, submitted_by)
  values (v_lead_id, trim(p_name), nullif(trim(p_phone), ''), nullif(trim(p_email), ''), 'client');
end;
$$;

revoke all on function add_lead_referral(uuid, text, text, text) from public, authenticated;
grant execute on function add_lead_referral(uuid, text, text, text) to anon;
