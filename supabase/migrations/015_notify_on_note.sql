-- Client notifications: when someone posts a message-board update, this
-- fires the notify-client Edge Function, which emails the client a short
-- "there's an update" note with a link to their page.
--
-- pg_net makes the HTTP call asynchronously — the person posting the note
-- never waits on an email round trip, and a slow/failed email send can't
-- block or break the actual database write.

create extension if not exists pg_net with schema extensions;

create or replace function notify_client_on_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://dbwyfpupthjotgyjrttz.supabase.co/functions/v1/notify-client',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('record', jsonb_build_object(
      'id', new.id,
      'transaction_id', new.transaction_id,
      'side', new.side,
      'author_name', new.author_name,
      'body', new.body
    ))
  );
  return new;
end;
$$;

drop trigger if exists on_note_created on notes;
create trigger on_note_created
  after insert on notes
  for each row execute function notify_client_on_note();
