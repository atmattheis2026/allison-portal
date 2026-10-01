-- Personal favorite stars (Allison, 2026-10-01).
--
-- 081's leads.starred was one star shared by everyone. Allison does loans and
-- transaction coordination for Ryan (and maybe Rich), so the same client can
-- be a favorite for one of them and not the other. Each person now has their
-- own star: one row per (client, person). The Clients page shows initials of
-- whoever starred a client and filters by "My favorites" / one person's.
--
-- Visibility rides on the leads table's own RLS: you can see or set a star
-- only on a client file you can already see. You can only add or remove
-- your own star. Private to the team; get_shared_lead() never reads this.

create table if not exists lead_stars (
  lead_id     uuid not null references leads(id) on delete cascade,
  profile_id  uuid not null default auth.uid() references profiles(id) on delete cascade,
  author_name text,
  created_at  timestamptz not null default now(),
  primary key (lead_id, profile_id)
);

alter table lead_stars enable row level security;

drop policy if exists lead_stars_select on lead_stars;
create policy lead_stars_select on lead_stars for select to authenticated
  using (exists (select 1 from leads l where l.id = lead_stars.lead_id));

drop policy if exists lead_stars_insert on lead_stars;
create policy lead_stars_insert on lead_stars for insert to authenticated
  with check (profile_id = auth.uid() and exists (select 1 from leads l where l.id = lead_stars.lead_id));

drop policy if exists lead_stars_delete on lead_stars;
create policy lead_stars_delete on lead_stars for delete to authenticated
  using (profile_id = auth.uid());

-- Stars already set with 081 were Allison's; they become her personal stars.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_name = 'leads' and column_name = 'starred') then
    insert into lead_stars (lead_id, profile_id, author_name)
    select l.id, p.id, p.full_name
      from leads l
      join profiles p on p.email = 'allisonsellsflorida@gmail.com'
     where l.starred
    on conflict do nothing;
  end if;
end $$;
