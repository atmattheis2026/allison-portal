-- A photo/logo slot for contacts (title company logo, inspector's headshot,
-- etc.), carried through to saved vendors too so it's picked up automatically
-- next time.

alter table contacts add column if not exists photo_url text;
alter table saved_contacts add column if not exists photo_url text;

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
