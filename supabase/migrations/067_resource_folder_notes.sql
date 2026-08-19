-- Free-type notes inside each Home Page folder — a running log anyone with
-- access to that folder can post to, same shape as the existing "Updates"
-- boards on transactions/leads (migrations 008, 056). Same access rule as
-- everything else in a folder: can_access_resource_folder() (Database
-- Manager, or an explicit grant — see migration 066).
--
-- Notification is deliberately NOT "every note emails everyone." Allison
-- was explicit: notifications should happen, but not every time. The model
-- she picked is "whoever posts decides" — notes are silent by default, and
-- the person posting checks a box to notify everyone with access to that
-- folder about that one note. There's no digest job and no per-person
-- opt-in preference table; the app calls the edge function directly, right
-- after a successful insert, only when that box was checked.

create table resource_folder_notes (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null references resource_folders(id) on delete cascade,
  author_name text,
  body        text not null,
  -- Whether a notification was actually sent for this note — shown in the
  -- UI as a small marker, not just a write-only flag.
  notified    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on resource_folder_notes (folder_id, created_at);

alter table resource_folder_notes enable row level security;

create policy folder_notes_rw on resource_folder_notes for all to authenticated
  using (can_access_resource_folder(folder_id))
  with check (can_access_resource_folder(folder_id));
