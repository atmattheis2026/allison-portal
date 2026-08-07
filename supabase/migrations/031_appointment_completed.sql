-- Marks whether a showing actually happened. Drives the "promote to Homes
-- shown" action in the app (copies the appointment's address/link/photo/note
-- into lead_homes) — the appointment itself stays in the list either way,
-- this just tracks whether it's done. Internal only; not part of
-- get_shared_lead(), since the client doesn't need to see this distinction.
alter table lead_appointments add column if not exists completed boolean not null default false;
