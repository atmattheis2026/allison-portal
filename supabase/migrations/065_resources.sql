-- Resources: a reference page of docs and links for Database Managers —
-- things worth keeping handy about agents and transactions (forms, policy
-- docs, saved links) that don't belong on any one transaction or lead.
--
-- Design notes for whoever reads this next (including Allison's Claude):
--
--  * Gated with is_database_manager(), which already existed (migration
--    052, added for deleting transactions). Reusing it here rather than
--    inventing a new role check — Database Manager already means "trusted
--    with team-wide, higher-stakes stuff" in this app.
--
--  * Database-Manager-only for BOTH reading and writing, on purpose — this
--    is a private admin reference page, not shared with agents (Allison's
--    choice 2026-08-12). If that changes later, split into a read policy
--    open to the whole team and a write policy still gated to
--    is_database_manager(), same shape as brands/team_members elsewhere.
--
--  * File uploads reuse the existing public 'media' storage bucket, same as
--    lead_documents (migration 058) and every headshot/photo in the app.
--    That bucket has always been world-readable by anyone with the exact
--    URL (see migration 001) — a resource file is exactly as protected as
--    everything else already stored there, no weaker and no stronger. The
--    `resources` table row itself (title, description, which category, and
--    the fact the file exists) is what's actually restricted to Database
--    Managers; the raw file URL relies on being unguessable, same as today.

create table resources (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  category    text not null default 'general' check (category in ('agents','transactions','general')),
  title       text not null,
  description text,
  url         text,          -- an external link
  file_url    text,          -- an uploaded file, from the 'media' bucket
  file_name   text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index on resources (team_id, category, sort_order);

alter table resources enable row level security;

create policy dbmanager_rw on resources for all to authenticated
  using (is_platform_admin() or (team_id = my_team_id() and is_database_manager()))
  with check (is_platform_admin() or (team_id = my_team_id() and is_database_manager()));
