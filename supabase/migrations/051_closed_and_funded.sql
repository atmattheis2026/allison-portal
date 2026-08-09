-- A converted lead used to get archived (dropped off Active Buyers
-- entirely). Now it stays visible there, just flagged as under contract,
-- until the linked transaction is marked Closed & Funded — at which point
-- it moves to a new "Closed" list instead.
alter table leads add column if not exists lead_status text not null default 'active'
  check (lead_status in ('active', 'under_contract', 'closed'));
alter table leads add column if not exists closed_date date;

alter table transactions add column if not exists closed_and_funded boolean not null default false;
alter table transactions add column if not exists closed_and_funded_date date;

-- Conversion no longer archives the lead — it just flips it to
-- under_contract so it stays in Active Buyers with different styling.
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

  update leads set converted_transaction_id = v_tx_id, lead_status = 'under_contract'
   where id = p_lead_id;

  return v_tx_id;
end;
$$;

-- Marks a transaction Closed & Funded and pushes the linked lead (if any)
-- into the Closed list with the same date. security definer + team check
-- since this crosses two tables that need to move together.
create or replace function mark_transaction_closed(p_transaction_id uuid, p_closed_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from transactions where id = p_transaction_id;
  if v_team is null then
    raise exception 'transaction % not found', p_transaction_id;
  end if;
  if v_team is distinct from my_team_id() and not is_platform_admin() then
    raise exception 'not your transaction';
  end if;

  update transactions
     set closed_and_funded = true, closed_and_funded_date = p_closed_date, status = 'closed'
   where id = p_transaction_id;

  update leads
     set lead_status = 'closed', closed_date = p_closed_date
   where converted_transaction_id = p_transaction_id;
end;
$$;

revoke all on function mark_transaction_closed(uuid, date) from public;
grant execute on function mark_transaction_closed(uuid, date) to authenticated;

-- Finds closed clients whose closing-date anniversary (month/day, any year)
-- lands exactly p_days_ahead days from today, for BOTH the assigned agent
-- and the assigned lender (a lead can have neither, either, or both) — same
-- wraparound handling as get_due_date_reminders. One row per recipient.
create or replace function get_due_closing_anniversaries(p_days_ahead int default 0)
returns table (
  lead_id uuid, lead_name text, lead_name_2 text, closed_date date,
  recipient_email text, recipient_name text, team_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with occurrences as (
    select
      l.id as lead_id, l.full_name, l.full_name_2, l.closed_date, l.team_id,
      l.realtor_member_id, l.lender_member_id,
      make_date(extract(year from current_date)::int,
                extract(month from l.closed_date)::int,
                extract(day from l.closed_date)::int) as this_year_date
    from leads l
   where l.lead_status = 'closed'
     and l.closed_date is not null
     and l.archived_at is null
  ),
  due as (
    select * from occurrences
     where (this_year_date - current_date) = p_days_ahead
        or ((this_year_date + interval '1 year')::date - current_date) = p_days_ahead
  )
  select d.lead_id, d.full_name, d.full_name_2, d.closed_date, m.email, m.full_name, d.team_id
    from due d
    join team_members m on m.id = d.realtor_member_id
   where m.email is not null
  union all
  select d.lead_id, d.full_name, d.full_name_2, d.closed_date, m.email, m.full_name, d.team_id
    from due d
    join team_members m on m.id = d.lender_member_id
   where m.email is not null
$$;

revoke all on function get_due_closing_anniversaries(int) from public, anon, authenticated;
grant execute on function get_due_closing_anniversaries(int) to service_role;

-- get_shared_transaction() needs to expose the two new fields — both sides
-- benefit from seeing it (agent for the badge, client to see it's official).
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
      'closed_and_funded', v_tx.closed_and_funded,
      'closed_and_funded_date', v_tx.closed_and_funded_date,
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
          'name', m.full_name, 'company', m.company_name, 'license', m.license_number,
          'headshot_url', m.headshot_url, 'phone', m.phone, 'email', m.email,
          'is_in_house', true, 'nmls_number', m.nmls_number,
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

-- Daily schedule, same time as the other reminder jobs.
select cron.schedule(
  'daily-closing-anniversaries',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://dbwyfpupthjotgyjrttz.supabase.co/functions/v1/send-closing-anniversary-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRid3lmcHVwdGhqb3RneWpydHR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDAxMjUsImV4cCI6MjEwMTYxNjEyNX0.MxyA-JBb9Cx1zTVHZoeORDbQzCcTeu7Uj3iGo_RBjZU',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
