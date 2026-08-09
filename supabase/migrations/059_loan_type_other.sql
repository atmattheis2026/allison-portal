-- "Other" on loan type didn't say what it actually was. Free-text field for
-- when the dropdown doesn't cover it (a portfolio loan, a bridge loan, etc.)
-- — client-visible, same as loan_type/loan_status themselves.
alter table leads add column if not exists loan_type_other text;

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
      'full_name', v_lead.full_name,
      'full_name_2', v_lead.full_name_2,
      'client_photo_url', v_lead.client_photo_url,
      'client_photo_url_2', v_lead.client_photo_url_2,
      'wants_buying', v_lead.wants_buying,
      'wants_loan', v_lead.wants_loan,
      'loan_type', v_lead.loan_type,
      'loan_type_other', v_lead.loan_type_other,
      'loan_status', v_lead.loan_status,
      'preapproval_on_file', v_lead.preapproval_on_file,
      'budget', v_lead.budget,
      'purchase_type', v_lead.purchase_type,
      'funding_type', v_lead.funding_type,
      'has_house_to_sell', v_lead.has_house_to_sell,
      'why_selling', v_lead.why_selling
    ),
    'realtor', (
      select jsonb_build_object('full_name', m.full_name, 'license_number', m.license_number,
                                'headshot_url', m.headshot_url, 'phone', m.phone, 'email', m.email,
                                'website_1', m.realtor_website_1, 'website_2', m.realtor_website_2,
                                'website_3', m.realtor_website_3)
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
               'id', a.id, 'scheduled_at', a.scheduled_at, 'address_line', a.address_line,
               'city_state_zip', a.city_state_zip,
               'url', a.url, 'photo_url', a.photo_url, 'note', a.note, 'completed', a.completed)
               order by a.sort_order)
        from lead_appointments a where a.lead_id = v_lead.id
    ), '[]'::jsonb),
    'homes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', h.id, 'address_line', h.address_line, 'city_state_zip', h.city_state_zip,
               'price', h.price, 'url', h.url, 'photo_url', h.photo_url, 'note', h.note,
               'shown_at', h.shown_at, 'offer_requested', h.offer_requested)
               order by h.sort_order)
        from lead_homes h where h.lead_id = v_lead.id
    ), '[]'::jsonb),
    'maybe_homes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', h.id, 'address_line', h.address_line, 'city_state_zip', h.city_state_zip,
               'url', h.url, 'photo_url', h.photo_url, 'note', h.note,
               'showing_requested', h.showing_requested)
               order by h.sort_order)
        from lead_maybe_homes h where h.lead_id = v_lead.id
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
