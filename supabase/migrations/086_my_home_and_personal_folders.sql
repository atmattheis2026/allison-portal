-- Personal folders in the Resource Library, plus personal quick links,
-- motivation, to-do list and team market updates for My Home
-- (Allison, 2026-10-01).
--
-- Each person gets a private "My files" area: folders they own
-- (owner_profile_id = them), with subfolders, files, notes and contacts
-- inside, exactly like shared folders. Only the owner sees them — not other
-- team members and not Database Managers. (Platform admin keeps its usual
-- full bypass, same as every other table; the app only ever shows a person
-- their own.) Grants don't apply to personal folders.
--
-- Shared folders (owner_profile_id null) behave exactly as before.
-- category stays one of the existing values ('general' for personal
-- folders) so neither check constraint has to change.

alter table resource_folders
  add column if not exists owner_profile_id uuid references profiles(id) on delete cascade;
create index if not exists resource_folders_owner_idx on resource_folders (owner_profile_id);

-- The one access rule (see 066/069), now owner-aware. A folder is personal
-- if it or any folder above it has an owner; then only that owner (or a
-- platform admin) gets in.
create or replace function can_access_resource_folder(p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select id, team_id, parent_folder_id, owner_profile_id from resource_folders where id = p_folder_id
    union all
    select f.id, f.team_id, f.parent_folder_id, f.owner_profile_id
      from resource_folders f
      join chain c on f.id = c.parent_folder_id
  )
  select is_platform_admin()
    or exists (select 1 from chain c where c.owner_profile_id = auth.uid())
    or (
      not exists (select 1 from chain c where c.owner_profile_id is not null)
      and (
        exists (select 1 from chain c where c.team_id = my_team_id() and is_database_manager())
        or exists (
          select 1 from resource_folder_access a
           join chain c on c.id = a.folder_id
           where a.team_member_id = my_team_member_id() or a.mentor_id = my_mentor_id()
        )
      )
    )
$$;

-- Folders: Database Managers keep managing shared folders only; anyone on
-- the team can create, rename and delete their own personal folders.
drop policy if exists folder_insert on resource_folders;
create policy folder_insert on resource_folders for insert to authenticated
  with check (
    is_platform_admin()
    or (team_id = my_team_id() and owner_profile_id is null and is_database_manager())
    or (team_id = my_team_id() and owner_profile_id = auth.uid()
        and (parent_folder_id is null or can_access_resource_folder(parent_folder_id)))
  );

drop policy if exists folder_update on resource_folders;
create policy folder_update on resource_folders for update to authenticated
  using (is_platform_admin() or owner_profile_id = auth.uid()
         or (team_id = my_team_id() and owner_profile_id is null and is_database_manager()))
  with check (is_platform_admin() or owner_profile_id = auth.uid()
              or (team_id = my_team_id() and owner_profile_id is null and is_database_manager()));

drop policy if exists folder_delete on resource_folders;
create policy folder_delete on resource_folders for delete to authenticated
  using (is_platform_admin() or owner_profile_id = auth.uid()
         or (team_id = my_team_id() and owner_profile_id is null and is_database_manager()));

-- Files: a Database Manager's team-wide access no longer reaches into
-- someone's personal folder. Files in personal folders go through
-- resources_folder_granted_rw (can_access_resource_folder), which lets the
-- owner in.
drop policy if exists resources_dbmanager_rw on resources;
create policy resources_dbmanager_rw on resources for all to authenticated
  using (is_platform_admin() or (team_id = my_team_id() and is_database_manager()
         and (folder_id is null or can_access_resource_folder(folder_id))))
  with check (is_platform_admin() or (team_id = my_team_id() and is_database_manager()
              and (folder_id is null or can_access_resource_folder(folder_id))));

-- My quick links (same request): each person's own list of websites they
-- use often, shown on their My Home page. Private to that person.
create table if not exists my_links (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null default auth.uid() references profiles(id) on delete cascade,
  title       text not null default '',
  url         text not null,
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists my_links_profile_idx on my_links (profile_id, sort_order);

alter table my_links enable row level security;
drop policy if exists my_links_own on my_links;
create policy my_links_own on my_links for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- My motivation + my to-do list (same request): each person writes their own
-- quote/goal and keeps their own task list on My Home. Private to them.
create table if not exists my_home (
  profile_id  uuid primary key default auth.uid() references profiles(id) on delete cascade,
  motivation  text,
  updated_at  timestamptz not null default now()
);
alter table my_home enable row level security;
drop policy if exists my_home_own on my_home;
create policy my_home_own on my_home for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create table if not exists my_tasks (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null default auth.uid() references profiles(id) on delete cascade,
  body        text not null,
  due_date    date,
  done        boolean not null default false,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists my_tasks_profile_idx on my_tasks (profile_id, done, due_date);
alter table my_tasks enable row level security;
drop policy if exists my_tasks_own on my_tasks;
create policy my_tasks_own on my_tasks for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Market updates (same request): a team-wide board on My Home where the loan
-- officers post rate and market news for everyone. Team-wide like the other
-- team tables, with the same mentor wall (064). The app shows the post box
-- to loan officers, mortgage brokers and Database Managers; anyone on the
-- team can read. People delete their own posts; Database Managers any.
create table if not exists market_updates (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references teams(id) on delete cascade,
  author_profile_id  uuid not null default auth.uid() references profiles(id) on delete cascade,
  author_name        text,
  body               text not null,
  created_at         timestamptz not null default now()
);
create index if not exists market_updates_team_idx on market_updates (team_id, created_at desc);

alter table market_updates enable row level security;
drop policy if exists market_updates_read on market_updates;
create policy market_updates_read on market_updates for select to authenticated
  using (is_platform_admin() or (team_id = my_team_id() and not is_mentor()));
drop policy if exists market_updates_post on market_updates;
create policy market_updates_post on market_updates for insert to authenticated
  with check (author_profile_id = auth.uid() and (is_platform_admin() or (team_id = my_team_id() and not is_mentor())));
drop policy if exists market_updates_remove on market_updates;
create policy market_updates_remove on market_updates for delete to authenticated
  using (author_profile_id = auth.uid() or is_platform_admin()
         or (team_id = my_team_id() and is_database_manager()));
