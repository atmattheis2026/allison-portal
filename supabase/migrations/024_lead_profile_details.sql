-- Rounding out the buyer profile on a lead. All internal only, same as
-- general_notes/referral_source — none of this is added to get_shared_lead().

alter table leads add column if not exists preapproval_on_file boolean not null default false;
alter table leads add column if not exists budget text;
alter table leads add column if not exists communities text;
alter table leads add column if not exists likes text;
alter table leads add column if not exists dislikes text;
alter table leads add column if not exists purchase_type text
  check (purchase_type in ('investment', 'personal'));
alter table leads add column if not exists funding_type text
  check (funding_type in ('cash', 'financing'));
alter table leads add column if not exists has_house_to_sell boolean not null default false;
alter table leads add column if not exists why_selling text;
alter table leads add column if not exists friends_family_referrals text;

-- Kids, pets, birthdays, anniversaries, other dates worth remembering — a
-- list rather than one text box since these are naturally separate facts,
-- same reasoning as lead_priorities.
create table lead_personal_notes (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  text       text not null default '',
  sort_order int not null default 0
);
create index on lead_personal_notes (lead_id, sort_order);

alter table lead_personal_notes enable row level security;

-- Reuses lead_visible(), which already accounts for the per-agent visibility
-- rule and the platform-admin bypass — nothing new to define there.
create policy lead_child_rw on lead_personal_notes for all to authenticated
  using (lead_visible(lead_personal_notes.lead_id))
  with check (lead_visible(lead_personal_notes.lead_id));
