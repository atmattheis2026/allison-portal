-- One true lifetime file per client: a repeat client (buys again, sells,
-- refinances) reactivates their existing lead instead of getting a second,
-- disconnected record. Since a lead can now have more than one transaction
-- over its life, converted_transaction_id (still "the current one") is no
-- longer enough on its own — this table is the full history, past and
-- present.
create table if not exists lead_transactions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (lead_id, transaction_id)
);
create index if not exists lead_transactions_lead_idx on lead_transactions (lead_id);

alter table lead_transactions enable row level security;
drop policy if exists team_rw on lead_transactions;
create policy team_rw on lead_transactions for all to authenticated
  using (exists (
    select 1 from leads l where l.id = lead_transactions.lead_id
                            and (l.team_id = my_team_id() or is_platform_admin())
  ))
  with check (exists (
    select 1 from leads l where l.id = lead_transactions.lead_id
                            and (l.team_id = my_team_id() or is_platform_admin())
  ));

-- Backfill: every lead that's already converted gets its one existing
-- transaction recorded as history.
insert into lead_transactions (lead_id, transaction_id)
select id, converted_transaction_id from leads
 where converted_transaction_id is not null
on conflict do nothing;

-- Same as before, plus recording the new transaction in the history table.
create or replace function convert_lead_to_transaction(p_lead_id uuid, p_home_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead leads;
  v_home lead_homes;
  v_tx_id uuid;
begin
  select * into v_lead from leads where id = p_lead_id;
  if v_lead.id is null then
    raise exception 'lead % not found', p_lead_id;
  end if;
  if v_lead.team_id is distinct from my_team_id() and not is_platform_admin() then
    raise exception 'not your lead';
  end if;
  if v_lead.converted_transaction_id is not null then
    return v_lead.converted_transaction_id;
  end if;

  if p_home_id is not null then
    select * into v_home from lead_homes where id = p_home_id and lead_id = p_lead_id;
    if v_home.id is null then
      raise exception 'that home isn''t on this lead';
    end if;
  end if;

  insert into transactions (team_id, deal_type, realtor_member_id, address_line, city_state_zip, photo_url, listing_url)
  values (
    v_lead.team_id, 'buy', v_lead.realtor_member_id,
    coalesce(v_home.address_line, ''), coalesce(v_home.city_state_zip, ''), v_home.photo_url, v_home.url
  )
  returning id into v_tx_id;

  perform seed_transaction(v_tx_id);
  perform apply_rail_steps(v_tx_id);

  update contacts
     set name = nullif(v_lead.full_name, ''), phone = v_lead.phone, email = v_lead.email
   where transaction_id = v_tx_id and role_label = 'Buyers';

  if v_lead.realtor_member_id is not null then
    insert into transaction_assignees (transaction_id, team_member_id)
    values (v_tx_id, v_lead.realtor_member_id)
    on conflict do nothing;
  end if;

  insert into lead_transactions (lead_id, transaction_id) values (p_lead_id, v_tx_id)
  on conflict do nothing;

  update leads set converted_transaction_id = v_tx_id, lead_status = 'under_contract'
   where id = p_lead_id;

  return v_tx_id;
end;
$$;

-- Reopens a closed (or under-contract) client's existing file for a new
-- deal — clears the "current transaction" pointer so Convert to Transaction
-- works again, without touching lead_transactions, so every past deal stays
-- visible in their history.
create or replace function reactivate_lead(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from leads where id = p_lead_id;
  if v_team is null then
    raise exception 'lead % not found', p_lead_id;
  end if;
  if v_team is distinct from my_team_id() and not is_platform_admin() then
    raise exception 'not your lead';
  end if;

  update leads
     set lead_status = 'active', converted_transaction_id = null, closed_date = null
   where id = p_lead_id;
end;
$$;

revoke all on function reactivate_lead(uuid) from public;
grant execute on function reactivate_lead(uuid) to authenticated;
