-- Turns out this needs to hold things like "80/20", not a plain percentage
-- number — a numeric column can't store a slash or dash at all.
alter table leads alter column referral_epic_split_pct type text
  using referral_epic_split_pct::text;
