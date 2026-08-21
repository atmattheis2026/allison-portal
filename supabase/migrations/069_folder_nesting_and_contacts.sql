-- Folders inside folders, plus a contacts list per folder — added for the
-- Loans category specifically: a top-level folder per loan type (DSCR,
-- Conventional, ...), a subfolder per lender within that, and each folder
-- (at any depth) can hold its own docs, notes, AND now contacts (the best
-- people to call for that lender). Allison's own scenario, 2026-08-19.
--
-- Design notes for whoever reads this next (including Allison's Claude):
--
--  * `parent_folder_id` is self-referencing and nullable — null means a
--    top-level folder (what every folder was before this migration).
--    Nothing about existing folders changes; this is purely additive.
--
--  * Access is INHERITED down the chain, on purpose: granting someone the
--    top-level "DSCR" folder gives them every lender subfolder inside it
--    automatically, matching how she actually thinks about this ("open my
--    DSCR folder and see a folder for each lender"). can_access_resource_
--    folder() now walks UP the parent chain — access to any ancestor
--    (including the folder itself) is enough.
--
--  * Known limitation, not a bug: granting a SUBFOLDER directly, without
--    also granting (or the person otherwise being able to see) its parent,
--    makes that subfolder selectable via RLS, but the UI renders subfolders
--    by iterating through their visible parent — so an invisible parent
--    means that subfolder won't currently render anywhere for that person.
--    Recommend granting the top-level folder instead (it cascades down) —
--    don't "fix" this by making the UI fetch orphaned subfolders separately
--    unless she specifically asks for grant-a-subfolder-alone to work.
--
--  * Contacts (`resource_folder_contacts`) use the exact same access
--    function as docs and notes — one person's access to a folder covers
--    all three content types inside it, there's no separate contacts-only
--    permission.

alter table resource_folders add column parent_folder_id uuid references resource_folders(id) on delete cascade;
create index on resource_folders (parent_folder_id);

create or replace function can_access_resource_folder(p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select id, team_id, parent_folder_id from resource_folders where id = p_folder_id
    union all
    select f.id, f.team_id, f.parent_folder_id
      from resource_folders f
      join chain c on f.id = c.parent_folder_id
  )
  select is_platform_admin()
    or exists (select 1 from chain c where c.team_id = my_team_id() and is_database_manager())
    or exists (
      select 1 from resource_folder_access a
       join chain c on c.id = a.folder_id
       where a.team_member_id = my_team_member_id() or a.mentor_id = my_mentor_id()
    )
$$;

create table resource_folder_contacts (
  id         uuid primary key default gen_random_uuid(),
  folder_id  uuid not null references resource_folders(id) on delete cascade,
  name       text not null default '',
  role_label text,
  phone      text,
  email      text,
  note       text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on resource_folder_contacts (folder_id, sort_order);

alter table resource_folder_contacts enable row level security;
create policy folder_contacts_rw on resource_folder_contacts for all to authenticated
  using (can_access_resource_folder(folder_id))
  with check (can_access_resource_folder(folder_id));
