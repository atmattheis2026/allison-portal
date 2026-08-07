-- Buying timeframe, for the color-coded urgency dot on the Active Buyers list.
--
-- Deliberately stores the BUCKET picked at add-time, not a computed target
-- date — the app derives "how far out are they now" from
-- (leads.created_at + bucket) vs. today, every time it renders. That's what
-- makes the color creep from orange -> yellow -> green on its own as the
-- original estimate ages, with no cron job or update needed: created_at is
-- fixed, "today" isn't.
alter table leads add column if not exists timeframe_bucket text
  check (timeframe_bucket in ('0-3', '3-6', '6+'));
