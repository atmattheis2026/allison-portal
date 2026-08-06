-- A third transaction type: loan-only (a refinance, or any loan she's helping
-- with where she isn't the agent). No real estate side at all — just the loan
-- checklist and contacts.

alter table transactions drop constraint if exists transactions_deal_type_check;
alter table transactions add constraint transactions_deal_type_check
  check (deal_type in ('buy','sell','loan'));

alter table milestone_templates drop constraint if exists milestone_templates_deal_type_check;
alter table milestone_templates add constraint milestone_templates_deal_type_check
  check (deal_type in ('buy','sell','loan'));

-- Same loan process as the buy-side loan checklist — it's not a different
-- kind of loan, just not attached to a real estate side this time.
create or replace function seed_loan_only_templates(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from milestone_templates where team_id = p_team and deal_type = 'loan';
  insert into milestone_templates (team_id, deal_type, side, label, has_date, sort_order)
  select p_team, 'loan', 'loan', label, has_date, sort_order
    from milestone_templates
   where team_id = p_team and deal_type = 'buy' and side = 'loan';
end;
$$;

revoke all on function seed_loan_only_templates(uuid) from public, anon, authenticated;

do $$
declare t uuid;
begin
  for t in select id from teams loop
    perform seed_loan_only_templates(t);
  end loop;
end $$;

-- Fold into first-run setup so new teams get it too.
create or replace function claim_workspace(p_team_name text, p_your_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_team uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to set up a workspace.';
  end if;

  select team_id into v_team from profiles where id = v_uid;
  if v_team is not null then
    return jsonb_build_object('team_id', v_team, 'created', false,
                              'message', 'This account is already set up.');
  end if;

  v_team := bootstrap_team(p_team_name);
  perform seed_seller_templates(v_team);
  perform seed_loan_only_templates(v_team);

  update profiles
     set team_id   = v_team,
         role      = 'admin',
         full_name = coalesce(nullif(p_your_name, ''), full_name)
   where id = v_uid;

  insert into team_members (team_id, profile_id, full_name, email, sort_order, sees_all_transactions)
  select v_team, v_uid,
         coalesce(nullif(p_your_name, ''), nullif(p.full_name, ''), 'Me'),
         p.email, 0, true
    from profiles p where p.id = v_uid;

  return jsonb_build_object('team_id', v_team, 'created', true,
                            'message', 'Workspace ready.');
end;
$$;

-- Rail steps for loan-only deals.
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
  elsif v_deal = 'loan' then
    update milestones m set is_rail_step = true, rail_label = v.rail
      from (values
        ('Application complete',      'Application'),
        ('Submitted to underwriting', 'Underwriting'),
        ('Clear to close',            'Clear to close'),
        ('Closing disclosure signed', 'Docs signed'),
        ('Closing!',                  'Funded')
      ) as v(label, rail)
     where m.transaction_id = p_transaction_id
       and m.side = 'loan' and m.label = v.label;
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
