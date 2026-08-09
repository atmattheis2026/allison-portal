-- Same free-text address field the Active Client form already has for a
-- referral brokerage — useful here too since professional contacts (title
-- companies, lenders, inspectors) usually have a business address worth
-- keeping on file.
alter table saved_contacts add column if not exists address text;
