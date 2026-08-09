-- A professional contact is a person, but the thing worth remembering is
-- often the company they work for (which title company, which lender) —
-- separate from their personal name so both are searchable on their own.
alter table saved_contacts add column if not exists business_name text;
