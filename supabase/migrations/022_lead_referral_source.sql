-- Where this buyer came from. Internal only, same as general_notes — not
-- part of get_shared_lead(). Fixed list rather than free text, per Allison.
alter table leads add column if not exists referral_source text
  check (referral_source in ('EPIC provided', 'Personal Referral', 'Agent Referral', 'Lead IO', 'Realtor.com'));

-- Only relevant when referral_source = 'Agent Referral' — the referring
-- brokerage's own referral-fee agreement details. The app only shows these
-- fields in that case, but nothing at the database level enforces that
-- (they just stay null otherwise).
alter table leads add column if not exists referral_brokerage_name text;
alter table leads add column if not exists referral_brokerage_address text;
alter table leads add column if not exists referral_contact_info text;
alter table leads add column if not exists referral_commission_pct numeric(5,2);
alter table leads add column if not exists referral_doc_received boolean not null default false;
