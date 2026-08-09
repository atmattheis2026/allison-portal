-- A place to keep files on a client's own file — a preapproval letter, ID,
-- signed disclosure, etc. — for quick access later. Agent-facing only, same
-- shape as every other lead child table (lead_referrals, lead_homes).
create table lead_documents (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads(id) on delete cascade,
  file_name     text not null,
  file_url      text not null,
  storage_path  text not null,
  created_at    timestamptz not null default now()
);
create index on lead_documents (lead_id, created_at);

alter table lead_documents enable row level security;

create policy lead_child_rw on lead_documents for all to authenticated
  using (lead_visible(lead_documents.lead_id))
  with check (lead_visible(lead_documents.lead_id));
