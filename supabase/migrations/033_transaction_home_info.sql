-- "Home info" on the transaction page: listing link, HOA, property tax,
-- school district, county. Client-visible, same as the rest of the
-- transaction — a buyer cares about HOA fees and school district as much as
-- Allison does. Text fields rather than numeric on purpose (HOA is often
-- "$250/mo", tax is often "$4,200/yr est.") — same reasoning as lender_name
-- and lead_homes.price already being text.

alter table transactions add column if not exists listing_url text;
alter table transactions add column if not exists hoa_fee text;
alter table transactions add column if not exists property_tax text;
alter table transactions add column if not exists school_district text;
alter table transactions add column if not exists county text;

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
      'realtor_member_id', v_tx.realtor_member_id,
      'realtor_title', v_tx.realtor_title,
      'lender_member_id', v_tx.lender_member_id,
      'lender_title', v_tx.lender_title,
      'listing_url', v_tx.listing_url,
      'hoa_fee', v_tx.hoa_fee,
      'property_tax', v_tx.property_tax,
      'school_district', v_tx.school_district,
      'county', v_tx.county,
      'lender', case when v_tx.lender_member_id is not null then (
        select jsonb_build_object(
          'name', m.full_name, 'company', null, 'license', m.license_number,
          'headshot_url', m.headshot_url, 'phone', m.phone, 'email', m.email,
          'is_in_house', true
        )
        from team_members m where m.id = v_tx.lender_member_id
      ) else jsonb_build_object(
        'name', v_tx.lender_name,
        'company', v_tx.lender_company,
        'license', v_tx.lender_license,
        'headshot_url', v_tx.lender_headshot_url,
        'phone', v_tx.lender_phone,
        'email', v_tx.lender_email,
        'is_in_house', v_tx.lender_is_in_house
      ) end
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
               'note', c.note, 'photo_url', c.photo_url, 'sort_order', c.sort_order)
               order by c.group_key, c.sort_order)
        from contacts c where c.transaction_id = v_tx.id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'side', n.side, 'author_name', n.author_name,
               'body', n.body, 'created_at', n.created_at)
               order by n.created_at desc)
        from notes n where n.transaction_id = v_tx.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function get_shared_transaction(uuid) from public;
grant execute on function get_shared_transaction(uuid) to anon, authenticated;

-- Carry the listing link over too when converting a lead's home into a
-- transaction, alongside the address/city/photo it already copies.
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
    coalesce(v_home.address_line, ''), v_home.city_state_zip, v_home.photo_url, v_home.url
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
