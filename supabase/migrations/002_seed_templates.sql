-- Seeds a team with Allison's buyer checklist, exactly as she sent it Aug 5 2026.
--
-- The SELLER templates are deliberately NOT seeded. She builds that list herself
-- in Settings > Checklists, because only she knows her seller workflow. Creating
-- a 'sell' transaction before she does that produces an empty checklist, which is
-- the honest outcome, not a bug.

create or replace function bootstrap_team(p_team_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
begin
  insert into teams (name) values (p_team_name) returning id into v_team;

  -- Two brands, empty. She fills these in Settings > Branding.
  insert into brands (team_id, kind, name, wordmark_text, accent_hex) values
    (v_team, 'real_estate', p_team_name, upper(p_team_name), '#C9A44C'),
    (v_team, 'lending',     '',          'LENDING',          '#7F9CB8');

  -- ---- BUYER: real estate side (her list, in her order) ----
  insert into milestone_templates (team_id, deal_type, side, label, has_date, sort_order) values
    (v_team,'buy','real_estate','Contract day',                          true,  10),
    (v_team,'buy','real_estate','Earnest deposit',                       true,  20),
    (v_team,'buy','real_estate','Inspection date',                       true,  30),
    (v_team,'buy','real_estate','Inspection report & negotiations due',  true,  40),
    (v_team,'buy','real_estate','Appraisal date',                        true,  50),
    (v_team,'buy','real_estate','Appraisal due',                         true,  60),
    (v_team,'buy','real_estate','Estoppel complete',                     false, 70),
    (v_team,'buy','real_estate','Survey date',                           true,  80),
    (v_team,'buy','real_estate','Survey complete',                       false, 90),
    (v_team,'buy','real_estate','Clear to close',                        false,100),
    (v_team,'buy','real_estate','Signing date',                          true, 110),
    (v_team,'buy','real_estate','Final wire sent',                       false,120),
    (v_team,'buy','real_estate','Final walk through',                    false,130),
    (v_team,'buy','real_estate','Funded!!',                              false,140);

  -- ---- BUYER: loan side ----
  insert into milestone_templates (team_id, deal_type, side, label, has_date, sort_order) values
    (v_team,'buy','loan','Application complete',              false, 10),
    (v_team,'buy','loan','Documentation on file',             false, 20),
    (v_team,'buy','loan','Preapproval complete',              false, 30),
    (v_team,'buy','loan','Initial disclosures complete',      false, 40),
    (v_team,'buy','loan','Lock rate',                         false, 50),
    (v_team,'buy','loan','Order appraisal',                   false, 60),
    (v_team,'buy','loan','Order title work',                  false, 70),
    (v_team,'buy','loan','Homeowners insurance set',          false, 80),
    (v_team,'buy','loan','Submitted to underwriting',         false, 90),
    (v_team,'buy','loan','Cleared conditions',                false,100),
    (v_team,'buy','loan','Final underwriting',                false,110),
    (v_team,'buy','loan','Clear to close',                    false,120),
    (v_team,'buy','loan','Closing disclosure signed',         true, 130),
    (v_team,'buy','loan','Balance numbers with title & lender',false,140),
    (v_team,'buy','loan','Closing!',                          false,150);

  insert into doc_line_templates (team_id, group_key, blank_count) values
    (v_team,'documentation',6),
    (v_team,'conditions',6);

  insert into contact_templates (team_id, group_key, role_label, sort_order) values
    (v_team,'people','Buyers',              10),
    (v_team,'people','Sellers',             20),
    (v_team,'people','Realtor',             30),
    (v_team,'people','Loan Officer',        40),
    (v_team,'people','Lender',              50),
    (v_team,'people','Title Company',       60),
    (v_team,'people','Inspector',           70),
    (v_team,'people','Homeowners Insurance',80),
    (v_team,'utilities','Power',    10),
    (v_team,'utilities','Water',    20),
    (v_team,'utilities','Gas',      30),
    (v_team,'utilities','Cable',    40),
    (v_team,'utilities','Internet', 50),
    (v_team,'utilities','HOA',      60);

  return v_team;
end;
$$;

-- Which real-estate steps appear on the progress rail. Applied after seeding so
-- the rail stays in sync with whatever her checklist says.
create or replace function apply_rail_steps(p_transaction_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update milestones set is_rail_step = false where transaction_id = p_transaction_id;

  update milestones m set is_rail_step = true, rail_label = v.rail
    from (values
      ('Contract day','Contract'),
      ('Inspection date','Inspection'),
      ('Appraisal date','Appraisal'),
      ('Clear to close','Clear to close'),
      ('Signing date','Signing'),
      ('Funded!!','Funded')
    ) as v(label, rail)
   where m.transaction_id = p_transaction_id
     and m.side = 'real_estate'
     and m.label = v.label;
end;
$$;
