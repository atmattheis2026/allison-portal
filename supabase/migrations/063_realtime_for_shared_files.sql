-- Lets more than one person have the same client file or transaction file
-- open at once and see each other's changes without refreshing. Realtime
-- only pushes changes for tables added to this publication — idempotent
-- (checks pg_publication_tables first) since re-adding an already-member
-- table throws.
do $$
declare
  t text;
begin
  foreach t in array array[
    'leads', 'lead_appointments', 'lead_homes', 'lead_maybe_homes', 'lead_priorities',
    'lead_personal_notes', 'lead_referrals', 'lead_documents', 'lead_notes', 'lead_transactions',
    'transactions', 'contacts', 'milestones', 'doc_lines', 'notes', 'transaction_assignees'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
