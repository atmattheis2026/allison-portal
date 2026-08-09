-- Lets the agent or lender mark a client's portal activity (a showing
-- request, an offer request, or a referral) as handled, so it drops off the
-- Active Clients list without touching the original request flag — that
-- flag still drives what the client themselves sees on their own page.
alter table lead_maybe_homes add column if not exists showing_request_resolved boolean not null default false;
alter table lead_homes add column if not exists offer_request_resolved boolean not null default false;
alter table lead_referrals add column if not exists resolved boolean not null default false;
