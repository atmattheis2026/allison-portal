-- Allison's seller checklist (texted 2026-08-06) and compliance disclaimers.
--
-- Her seller list has NO loan side at all, which confirms the two-column layout
-- for listings. Notably it is not a mirror of the buyer list: it starts before
-- there's a contract (listing agreement, photos, MLS go-live, open house) and it
-- includes 'provide utilities to buyer', which is the seller handing over the
-- utility info the buyer's page displays.

create or replace function seed_seller_templates(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from milestone_templates
   where team_id = p_team and deal_type = 'sell';

  insert into milestone_templates (team_id, deal_type, side, label, has_date, sort_order) values
    (p_team,'sell','real_estate','Listing agreement',            true,  10),
    (p_team,'sell','real_estate','Photos',                       true,  20),
    (p_team,'sell','real_estate','MLS go-live',                  true,  30),
    (p_team,'sell','real_estate','Open house',                   true,  40),
    (p_team,'sell','real_estate','Contract agreement',           true,  50),
    (p_team,'sell','real_estate','Earnest deposit due',          true,  60),
    (p_team,'sell','real_estate','Earnest deposit received',     false, 70),
    (p_team,'sell','real_estate','Inspection scheduled',         true,  80),
    (p_team,'sell','real_estate','Inspection due',               true,  90),
    (p_team,'sell','real_estate','Estoppel ordered and cleared', false,100),
    (p_team,'sell','real_estate','Appraisal scheduled',          true, 110),
    (p_team,'sell','real_estate','Appraisal due',                true, 120),
    (p_team,'sell','real_estate','Buyers clear to close',        false,130),
    (p_team,'sell','real_estate','Provide utilities to buyer',   false,140),
    (p_team,'sell','real_estate','Signing scheduled',            true, 150),
    (p_team,'sell','real_estate','Funded!',                      false,160);
  -- No 'sell'/'loan' rows on purpose: the Loan section disappears on listings.
end;
$$;

-- Backfill every existing team.
do $$
declare t uuid;
begin
  for t in select id from teams loop
    perform seed_seller_templates(t);
  end loop;
end $$;

-- Fold it into new-team bootstrap.
create or replace function bootstrap_team_v2(p_team_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_team uuid;
begin
  v_team := bootstrap_team(p_team_name);
  perform seed_seller_templates(v_team);
  return v_team;
end;
$$;

-- ---------------------------------------------------------------- rail steps

-- Rail labels now depend on deal type. Buyer and seller journeys have different
-- shapes, so they get different six-step summaries.
create or replace function apply_rail_steps(p_transaction_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_deal text;
begin
  select deal_type into v_deal from transactions where id = p_transaction_id;

  update milestones set is_rail_step = false, rail_label = null
   where transaction_id = p_transaction_id;

  if v_deal = 'sell' then
    update milestones m set is_rail_step = true, rail_label = v.rail
      from (values
        ('Listing agreement',    'Listed'),
        ('MLS go-live',          'Live'),
        ('Contract agreement',   'Under contract'),
        ('Inspection due',       'Inspection'),
        ('Buyers clear to close','Clear to close'),
        ('Funded!',              'Sold')
      ) as v(label, rail)
     where m.transaction_id = p_transaction_id
       and m.side = 'real_estate' and m.label = v.label;
  else
    update milestones m set is_rail_step = true, rail_label = v.rail
      from (values
        ('Contract day',   'Contract'),
        ('Inspection date','Inspection'),
        ('Appraisal date', 'Appraisal'),
        ('Clear to close', 'Clear to close'),
        ('Signing date',   'Signing'),
        ('Funded!!',       'Funded')
      ) as v(label, rail)
     where m.transaction_id = p_transaction_id
       and m.side = 'real_estate' and m.label = v.label;
  end if;
end;
$$;

-- ---------------------------------------------------------------- disclaimers

-- "There's also some disclaimers I need to have checked for the bottom of the
-- doc" — Allison, 2026-08-06. Real estate and lending have separate required
-- language (brokerage identification, Equal Housing, NMLS numbers), so each
-- brand carries its own and both render in the footer.
--
-- These ship EMPTY. Do not pre-fill compliance text — hers has to be approved by
-- her brokerage and her lender, and inventing plausible-looking legal language
-- is worse than showing nothing.

alter table brands add column if not exists disclaimer_text text;

-- Republish the client payload with the disclaimer included.
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
