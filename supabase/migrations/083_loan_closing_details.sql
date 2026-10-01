-- Loan Clients page + loan closing details (Allison, 2026-10-01).
--
-- When a loan client's deal closes, she records who the lender was, the
-- interest rate, and anything worth remembering for a future refinance.
-- Those clients then sit in the "Refi plan" column of the Loan Clients page.
-- loan_closed_date also lets a loan-only client (a refinance with no deal in
-- the app) be marked closed from that page. Private to her team;
-- get_shared_lead() lists its keys explicitly, so the client never sees these.

alter table leads add column if not exists loan_closed_date date;
alter table leads add column if not exists loan_closed_lender text;
alter table leads add column if not exists loan_closed_rate numeric(6,3);
alter table leads add column if not exists loan_closed_notes text;
