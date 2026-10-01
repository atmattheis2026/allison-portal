-- Client stages and scheduled follow-ups (Allison, 2026-10-01).
--
-- The Clients page splits into three columns: Under contract, Upcoming and
-- Nurture (clients 6–9+ months out). Plus a tucked-away Inactive for people
-- who dropped out. lead_status gains 'nurture' and 'inactive'; 'active'
-- keeps meaning Upcoming, and 'under_contract'/'closed' are still set
-- automatically by the deal flow.
--
-- next_followup + followup_note: when to reach out next and what it's for.
-- Private to her team; get_shared_lead() lists its keys explicitly, so the
-- client never sees these.

alter table leads drop constraint if exists leads_lead_status_check;
alter table leads add constraint leads_lead_status_check
  check (lead_status in ('active', 'under_contract', 'closed', 'nurture', 'inactive'));

alter table leads add column if not exists next_followup date;
alter table leads add column if not exists followup_note text;
