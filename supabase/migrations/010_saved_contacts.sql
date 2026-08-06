-- Saved vendors she can pick from instead of looking information up every
-- time — title companies, inspectors, insurance, utility providers. Keyed by
-- role_label, so "saved Title Companies" and "saved Power companies" are
-- separate lists. Team members (Realtor, Loan Officer) already have their own
-- roster for this same purpose — this covers everyone else on the Contacts
-- section.
--
-- Nothing pre-fills automatically: she saves a vendor once (from a filled-in
-- contact row), and picks it on future transactions. No guessing at her real
-- vendors' contact details on her behalf.

create table saved_contacts (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  group_key  text not null check (group_key in ('people','utilities')),
  role_label text not null,
  name       text not null,
  phone      text,
  email      text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on saved_contacts (team_id, group_key, role_label);

alter table saved_contacts enable row level security;

create policy team_rw on saved_contacts for all to authenticated
  using (team_id = my_team_id()) with check (team_id = my_team_id());
