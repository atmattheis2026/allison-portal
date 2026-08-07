-- Agent-only contacts — visible to the agent/admin side only, never sent to
-- the client. Reuses the existing contacts table (same columns, same edit
-- UI) gated by a new internal_only flag, mirroring how milestones already
-- do internal_only. get_shared_transaction() excludes these entirely, so
-- the admin page fetches them with a separate direct query (see
-- AdminTransaction.tsx) rather than through the shared payload.
alter table contacts add column if not exists internal_only boolean not null default false;
alter table contact_templates add column if not exists internal_only boolean not null default false;

-- New fixed roles every transaction should have going forward, agent-only.
insert into contact_templates (team_id, group_key, role_label, sort_order, internal_only)
select t.id, 'people', roles.role, roles.sort_order, true
  from teams t
  cross join (values
    ('Buyer Transaction Coordinator', 100),
    ('Seller Transaction Coordinator', 110),
    ('Title Closer', 120),
    ('Title Processor', 130)
  ) as roles(role, sort_order)
 where not exists (
   select 1 from contact_templates ct
    where ct.team_id = t.id and ct.role_label = roles.role and ct.internal_only = true
 );

-- Backfill: give every existing, non-archived transaction these same 4 rows
-- so agents don't have to add them by hand on deals already in progress.
insert into contacts (transaction_id, group_key, role_label, sort_order, internal_only)
select tx.id, 'people', roles.role, roles.sort_order, true
  from transactions tx
  cross join (values
    ('Buyer Transaction Coordinator', 100),
    ('Seller Transaction Coordinator', 110),
    ('Title Closer', 120),
    ('Title Processor', 130)
  ) as roles(role, sort_order)
 where tx.archived_at is null
   and not exists (
     select 1 from contacts c
      where c.transaction_id = tx.id and c.role_label = roles.role and c.internal_only = true
   );

-- seed_transaction() needs to carry internal_only forward for new transactions.
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
  if v_team is distinct from my_team_id() and not is_platform_admin() then
    raise exception 'not your transaction';
  end if;

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

  insert into contacts (transaction_id, group_key, role_label, sort_order, internal_only)
  select p_transaction_id, c.group_key, c.role_label, c.sort_order, c.internal_only
    from contact_templates c
   where c.team_id = v_team
   order by c.group_key, c.sort_order;
end;
$$;

-- get_shared_transaction() must exclude internal_only contacts from the
-- client-visible payload.
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
          'is_in_house', true,
          'website_1', m.lender_website_1, 'website_2', m.lender_website_2, 'website_3', m.lender_website_3
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
                                'headshot_url', m.headshot_url, 'phone', m.phone, 'email', m.email,
                                'website_1', m.realtor_website_1, 'website_2', m.realtor_website_2,
                                'website_3', m.realtor_website_3)
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
        from contacts c where c.transaction_id = v_tx.id and c.internal_only = false
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
