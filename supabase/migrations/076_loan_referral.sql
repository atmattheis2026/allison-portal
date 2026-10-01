-- Loan referral tracking on a client file.
--
-- The existing "Referral source" (referral_source and the referral_* columns
-- beside it) is for the real estate side: EPIC, eXp cap, agent referral fee.
-- Loans get referred by different people (realtors, past clients, CPAs,
-- builders), so they get their own box: where it came from, who sent it, how
-- to reach them, and a note. Allison wants to see who is sending loan
-- business her way.
--
-- Internal only. get_shared_lead() builds the client's payload from an
-- explicit list of keys, so these never reach the client page.

alter table leads add column if not exists loan_referral_source  text;
alter table leads add column if not exists loan_referral_name    text;
alter table leads add column if not exists loan_referral_contact text;
alter table leads add column if not exists loan_referral_notes   text;
