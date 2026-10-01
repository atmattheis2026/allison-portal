-- Favorite clients (Allison, 2026-10-01): a gold star for the people who buy
-- often and need regular contact. Private to her team; get_shared_lead()
-- lists its keys explicitly, so the client never sees it.

alter table leads add column if not exists starred boolean not null default false;
