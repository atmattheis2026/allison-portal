-- Loan Options Worksheet: the saved rate table.
--
-- One row per team: the loan programs (rate, APR, minimum down, "best for",
-- term, mortgage insurance, financed fee), the "rates as of" date and note,
-- the intro letter, and default tax/insurance figures. Allison updates it
-- when rates move; every worksheet she builds for a client starts from it.
--
-- No client information lives here. A finished worksheet is saved as a PDF
-- in that client's Documents (lead_documents + the existing `media` bucket),
-- exactly like an uploaded file.
--
-- Team-wide, so it gets the same "not a mentor" wall as every other
-- team-wide table since migration 064.

create table if not exists loan_rate_sheets (
  team_id            uuid primary key references teams(id) on delete cascade,
  programs           jsonb not null default '[]'::jsonb,
  as_of              date,
  assumptions        text,
  intro_1            text,
  intro_2            text,
  default_tax_rate   numeric,
  default_insurance  numeric,
  updated_at         timestamptz not null default now()
);

alter table loan_rate_sheets enable row level security;

drop policy if exists team_rw on loan_rate_sheets;
create policy team_rw on loan_rate_sheets for all to authenticated
  using ((team_id = my_team_id() and not is_mentor()) or is_platform_admin())
  with check ((team_id = my_team_id() and not is_mentor()) or is_platform_admin());
