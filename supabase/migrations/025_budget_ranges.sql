-- Budget becomes a fixed dropdown instead of free text, so it can actually be
-- filtered/sorted on later. Clears out anything already typed that doesn't
-- match one of these buckets before locking the column down, rather than
-- letting the constraint fail on whatever's already there.
update leads set budget = null
 where budget is not null
   and budget not in ('Under $200k', '$200k–$300k', '$300k–$400k', '$400k–$500k',
                       '$500k–$750k', '$750k–$1M', '$1M+');

alter table leads add constraint leads_budget_check
  check (budget in ('Under $200k', '$200k–$300k', '$300k–$400k', '$400k–$500k',
                     '$500k–$750k', '$750k–$1M', '$1M+'));
