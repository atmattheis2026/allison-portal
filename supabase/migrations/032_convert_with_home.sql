-- convert_lead_to_transaction() gains an optional p_home_id: when the buyer
-- goes under contract on a specific home from "Homes shown", that home's
-- address, city/state/zip, and photo carry straight into the new
-- transaction instead of starting blank. Omitting p_home_id keeps the old
-- behavior (a blank transaction) for whoever converts without picking one.
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

  insert into transactions (team_id, deal_type, realtor_member_id, address_line, city_state_zip, photo_url)
  values (
    v_lead.team_id, 'buy', v_lead.realtor_member_id,
    coalesce(v_home.address_line, ''), v_home.city_state_zip, v_home.photo_url
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

  update leads set converted_transaction_id = v_tx_id, archived_at = now()
   where id = p_lead_id;

  return v_tx_id;
end;
$$;
