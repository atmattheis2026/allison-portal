-- Renames the "admin" team role from Office Manager to Database Manager
-- (label only — app/src/lib/types.ts — nothing stored in the database uses
-- that display text) and, more importantly, locks down WHO can hand out the
-- two things on a team_members row that actually grant elevated access:
--   * sees_all_transactions (see every transaction/lead, not just assigned ones)
--   * the 'admin' entry in roles (the renamed Database Manager tag)
--
-- Until now, anyone signed in could flip either for anyone else — team_members
-- has always used a flat team-wide policy (migration 001), same as every
-- other team-scoped table. That was fine when these fields were cosmetic; it
-- stopped being fine once sees_all_transactions started gating real data
-- access. Allison wants exactly one person able to grant that kind of master
-- access, not several — hence gating on profiles.role = 'admin' rather than
-- team_members.roles, since profiles.role is the one flag nobody but the
-- original workspace owner has (set once, by claim_workspace, and never
-- exposed in any UI to change).
--
-- Deliberately per-column, not a blanket "only admins can touch team_members"
-- policy: everyone still needs to edit their own phone, headshot, license,
-- etc. The Team settings page always resends every member's full row on
-- every save (see AdminSettings.tsx Team.save()), so this only fires when a
-- value is ACTUALLY changing — untouched rows round-trip the same value and
-- pass right through.

-- Safety net: if for any reason the workspace owner's profile isn't marked
-- 'admin' (claim_workspace sets this, but this guards against any drift),
-- promote whoever is team_members sort_order 0 for each team — the
-- convention claim_workspace uses for "the person who set this up."
update profiles p
   set role = 'admin'
  from team_members m
 where m.profile_id = p.id
   and m.sort_order = (select min(sort_order) from team_members where team_id = m.team_id)
   and p.role is distinct from 'admin'
   and not exists (
     select 1 from profiles p2
      where p2.team_id = p.team_id and p2.role = 'admin'
   );

create or replace function guard_team_member_permission_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_new_is_admin boolean := coalesce('admin' = any(new.roles), false);
  v_old_is_admin boolean := coalesce('admin' = any(old.roles), false);
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if v_caller_role = 'admin' then
    return new;
  end if;

  if tg_op = 'insert' then
    if coalesce(new.sees_all_transactions, false) or v_new_is_admin then
      raise exception 'Only the workspace owner can grant "sees every transaction" or the Database Manager role.';
    end if;
    return new;
  end if;

  if new.sees_all_transactions is distinct from old.sees_all_transactions
     or v_new_is_admin is distinct from v_old_is_admin then
    raise exception 'Only the workspace owner can grant "sees every transaction" or the Database Manager role.';
  end if;

  return new;
end;
$$;

drop trigger if exists team_member_permission_guard on team_members;
create trigger team_member_permission_guard
  before insert or update on team_members
  for each row execute function guard_team_member_permission_fields();
