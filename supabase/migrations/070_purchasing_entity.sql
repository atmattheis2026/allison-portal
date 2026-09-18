-- How title will be held (individual / LLC / Trust), separate from the
-- buyer's own name and contact info in the Buyer info section.
alter table leads
  add column purchasing_entity text check (purchasing_entity in ('individual', 'llc', 'trust')),
  add column purchasing_entity_name text;
