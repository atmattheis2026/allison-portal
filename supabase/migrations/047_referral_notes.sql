-- Applies no matter which referral_source is picked (not just Agent
-- Referral) — internal only, same as the rest of the referral section.
alter table leads add column if not exists referral_met_exp_cap boolean;
alter table leads add column if not exists referral_epic_split_pct numeric(5,2);
alter table leads add column if not exists referral_notes text;
