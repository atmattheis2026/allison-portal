-- Client notifications for Active Buyer/loan clients — same idea as
-- migration 015's notify_client_on_note for transactions, just pointed at
-- lead_notes instead. pg_net is already enabled (see migration 015).
create or replace function notify_client_on_lead_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://dbwyfpupthjotgyjrttz.supabase.co/functions/v1/notify-lead-client',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('record', jsonb_build_object(
      'id', new.id,
      'lead_id', new.lead_id,
      'author_name', new.author_name,
      'body', new.body
    ))
  );
  return new;
end;
$$;

drop trigger if exists on_lead_note_created on lead_notes;
create trigger on_lead_note_created
  after insert on lead_notes
  for each row execute function notify_client_on_lead_note();
