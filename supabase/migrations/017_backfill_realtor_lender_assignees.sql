-- Picking a Realtor or Lender on a transaction (realtor_member_id /
-- lender_member_id) never added that person to transaction_assignees — the
-- separate join table that both drives the "who's on this deal" chips AND
-- gates whether a teammate without sees_all_transactions can even see the
-- transaction (see migration 005). The app code now keeps these in sync going
-- forward (AdminTransaction.tsx); this backfills every transaction that
-- already has a Realtor and/or Lender picked but is missing the matching row.

insert into transaction_assignees (transaction_id, team_member_id)
select t.id, t.realtor_member_id
  from transactions t
 where t.realtor_member_id is not null
on conflict (transaction_id, team_member_id) do nothing;

insert into transaction_assignees (transaction_id, team_member_id)
select t.id, t.lender_member_id
  from transactions t
 where t.lender_member_id is not null
on conflict (transaction_id, team_member_id) do nothing;
