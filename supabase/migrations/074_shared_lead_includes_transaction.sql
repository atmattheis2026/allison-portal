-- Heather's loan-update page (/l/<token>) showed no real estate or loan
-- progress once she was under contract. Since migration 055, a converted lead
-- stays active (lead_status 'under_contract', converted_transaction_id set)
-- instead of being archived. So the client keeps the /l/ link, but all the
-- real progress was on the transaction, which that link never showed.
--
-- Same as 073, plus a 'transaction' key: the full get_shared_transaction()
-- payload for the lead's current transaction, or null if there isn't one.
-- It's guarded like every other section, so it can't stop the page opening.

create or replace function get_shared_lead(p_token uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  l jsonb;
  v_realtor jsonb;
  v_lender jsonb;
  v_brand jsonb;
  v_appts jsonb := '[]'::jsonb;
  v_homes jsonb := '[]'::jsonb;
  v_maybe jsonb := '[]'::jsonb;
  v_prios jsonb := '[]'::jsonb;
  v_notes jsonb := '[]'::jsonb;
  v_tx jsonb;
begin
  select to_jsonb(x) into l from leads x
   where x.share_token = p_token and x.archived_at is null;

  if l is null then
    return null;
  end if;

  begin
    select jsonb_build_object('full_name', j->'full_name', 'license_number', j->'license_number',
             'headshot_url', j->'headshot_url', 'phone', j->'phone', 'email', j->'email',
             'website_1', j->'realtor_website_1', 'website_2', j->'realtor_website_2',
             'website_3', j->'realtor_website_3')
      into v_realtor
      from (select to_jsonb(m) j from team_members m
             where m.id = (l->>'realtor_member_id')::uuid) t;
  exception when others then v_realtor := null;
  end;

  begin
    select jsonb_build_object('full_name', j->'full_name', 'headshot_url', j->'headshot_url',
             'phone', j->'phone', 'email', j->'email',
             'company_name', j->'company_name', 'nmls_number', j->'nmls_number',
             'is_mortgage_broker', coalesce(j->'roles' ? 'mortgage_broker', false)
                                   and not coalesce(j->'roles' ? 'loan_officer', false),
             'website_1', j->'lender_website_1', 'website_2', j->'lender_website_2',
             'website_3', j->'lender_website_3')
      into v_lender
      from (select to_jsonb(m) j from team_members m
             where m.id = (l->>'lender_member_id')::uuid) t;
  exception when others then v_lender := null;
  end;

  begin
    select jsonb_build_object('name', j->'name', 'wordmark_text', j->'wordmark_text',
             'logo_url', j->'logo_url', 'logo_light_url', j->'logo_light_url',
             'accent_hex', j->'accent_hex', 'needs_light_background', j->'needs_light_background')
      into v_brand
      from (select to_jsonb(b) j from brands b
             where b.team_id = (l->>'team_id')::uuid and b.kind = 'real_estate' limit 1) t;
  exception when others then v_brand := null;
  end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', j->'id', 'scheduled_at', j->'scheduled_at', 'address_line', j->'address_line',
             'city_state_zip', j->'city_state_zip', 'url', j->'url', 'photo_url', j->'photo_url',
             'note', j->'note', 'completed', coalesce(j->'completed', 'false'::jsonb))
             order by (j->>'sort_order')::numeric nulls last), '[]'::jsonb)
      into v_appts
      from (select to_jsonb(a) j from lead_appointments a where a.lead_id = (l->>'id')::uuid) t;
  exception when others then v_appts := '[]'::jsonb;
  end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', j->'id', 'address_line', j->'address_line', 'city_state_zip', j->'city_state_zip',
             'price', j->'price', 'url', j->'url', 'photo_url', j->'photo_url', 'note', j->'note',
             'shown_at', j->'shown_at', 'offer_requested', coalesce(j->'offer_requested', 'false'::jsonb))
             order by (j->>'sort_order')::numeric nulls last), '[]'::jsonb)
      into v_homes
      from (select to_jsonb(h) j from lead_homes h where h.lead_id = (l->>'id')::uuid) t;
  exception when others then v_homes := '[]'::jsonb;
  end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', j->'id', 'address_line', j->'address_line', 'city_state_zip', j->'city_state_zip',
             'url', j->'url', 'photo_url', j->'photo_url', 'note', j->'note',
             'showing_requested', coalesce(j->'showing_requested', 'false'::jsonb))
             order by (j->>'sort_order')::numeric nulls last), '[]'::jsonb)
      into v_maybe
      from (select to_jsonb(h) j from lead_maybe_homes h where h.lead_id = (l->>'id')::uuid) t;
  exception when others then v_maybe := '[]'::jsonb;
  end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object('id', j->'id', 'text', j->'text')
             order by (j->>'sort_order')::numeric nulls last), '[]'::jsonb)
      into v_prios
      from (select to_jsonb(p) j from lead_priorities p where p.lead_id = (l->>'id')::uuid) t;
  exception when others then v_prios := '[]'::jsonb;
  end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', j->'id', 'author_name', j->'author_name', 'body', j->'body',
             'created_at', j->'created_at')
             order by j->>'created_at' desc), '[]'::jsonb)
      into v_notes
      from (select to_jsonb(n) j from lead_notes n where n.lead_id = (l->>'id')::uuid) t;
  exception when others then v_notes := '[]'::jsonb;
  end;

  -- Once they're under contract, the lead's current transaction is where all
  -- the real progress lives (checklists, status tracker, both updates boards).
  -- Reuse get_shared_transaction() so this returns exactly what that deal's
  -- own client link shows. It adds nothing the client couldn't already see.
  begin
    select get_shared_transaction(t.share_token) into v_tx
      from transactions t
     where t.id = (l->>'converted_transaction_id')::uuid;
  exception when others then v_tx := null;
  end;

  return jsonb_build_object(
    'lead', jsonb_build_object(
      'id', l->'id',
      'full_name', l->'full_name',
      'full_name_2', l->'full_name_2',
      'client_photo_url', l->'client_photo_url',
      'client_photo_url_2', l->'client_photo_url_2',
      'wants_buying', coalesce(l->'wants_buying', 'false'::jsonb),
      'wants_loan', coalesce(l->'wants_loan', 'false'::jsonb),
      'loan_type', l->'loan_type',
      'loan_type_other', l->'loan_type_other',
      'loan_status', l->'loan_status',
      'preapproval_on_file', coalesce(l->'preapproval_on_file', 'false'::jsonb),
      'budget', l->'budget',
      'purchase_type', l->'purchase_type',
      'funding_type', l->'funding_type',
      'has_house_to_sell', coalesce(l->'has_house_to_sell', 'false'::jsonb),
      'why_selling', l->'why_selling'
    ),
    'realtor', v_realtor,
    'lender', v_lender,
    'brand', v_brand,
    'appointments', v_appts,
    'homes', v_homes,
    'maybe_homes', v_maybe,
    'priorities', v_prios,
    'notes', v_notes,
    'transaction', v_tx
  );
end;
$$;

revoke all on function get_shared_lead(uuid) from public;
grant execute on function get_shared_lead(uuid) to anon, authenticated;
