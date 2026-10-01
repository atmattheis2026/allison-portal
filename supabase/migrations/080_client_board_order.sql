-- Hand-arranged order on the Clients page (Allison, 2026-10-01).
--
-- She drags clients up and down inside a column to line up who she wants to
-- talk to next. board_position is that order: smaller = higher. Null means
-- "not placed yet" (new clients), which shows at the top of its column.
-- Private to her team; get_shared_lead() lists its keys explicitly, so the
-- client never sees it.

alter table leads add column if not exists board_position double precision;
