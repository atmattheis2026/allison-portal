-- Two things found while extending the team feature:
--
-- 1. team_members never had a `role` column. Settings > Team's role picker
--    has been silently failing to save this whole time — nobody noticed
--    because nothing downstream read it yet. Fixed properly this time: a
--    LIST of roles per person, not one, since Allison's team has people who
--    are both an agent and a loan officer. Also adds the two roles she asked
--    for: Transaction Coordinator and Mortgage Broker.
--
-- 2. "Transaction Coordinator" joins the contact list every transaction gets,
--    for both new transactions going forward and her existing ones.

alter table team_members add column if not exists roles text[] not null default '{}';

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

  insert into brands (team_id, kind, name, wordmark_text, accent_hex) values
    (v_team, 'real_estate', p_team_name, upper(p_team_name), '#C9A44C'),
    (v_team, 'lending',     '',          'LENDING',          '#7F9CB8');

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
    (v_team,'people','Transaction Coordinator', 35),
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

-- Backfill: her existing team's template, and every transaction already in
-- progress, so this shows up without recreating anything.
insert into contact_templates (team_id, group_key, role_label, sort_order)
select t.id, 'people', 'Transaction Coordinator', 35
  from teams t
 where not exists (
   select 1 from contact_templates c
    where c.team_id = t.id and c.group_key = 'people' and c.role_label = 'Transaction Coordinator'
 );

insert into contacts (transaction_id, group_key, role_label, sort_order)
select x.id, 'people', 'Transaction Coordinator', 35
  from transactions x
 where x.archived_at is null
   and not exists (
     select 1 from contacts c
      where c.transaction_id = x.id and c.group_key = 'people' and c.role_label = 'Transaction Coordinator'
   );
