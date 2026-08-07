-- Phone/email for the second buyer, matching full_name_2 — internal only,
-- same as the existing phone/email columns (never part of get_shared_lead;
-- a client doesn't need their own contact info echoed back to them).
alter table leads add column if not exists phone_2 text;
alter table leads add column if not exists email_2 text;
