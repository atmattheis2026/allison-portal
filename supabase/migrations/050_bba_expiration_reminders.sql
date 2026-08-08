-- Finds active (signed) buyer broker agreements expiring exactly 7 days
-- from today, for whichever agent is assigned to that lead. Same shape and
-- reasoning as get_due_date_reminders (migration 028) — security definer,
-- looks across every team on purpose, since it's called by a scheduled job
-- with no signed-in user, via the send-bba-reminders edge function.
create or replace function get_due_bba_reminders(p_days_ahead int default 7)
returns table (
  lead_id uuid, lead_name text, expires date,
  agent_email text, agent_name text, team_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.full_name, l.buyer_broker_expires,
         m.email, m.full_name, l.team_id
    from leads l
    join team_members m on m.id = l.realtor_member_id
   where l.buyer_broker_signed = true
     and l.buyer_broker_expires is not null
     and m.email is not null
     and l.archived_at is null
     and (l.buyer_broker_expires - current_date) = p_days_ahead
$$;

revoke all on function get_due_bba_reminders(int) from public, anon, authenticated;
grant execute on function get_due_bba_reminders(int) to service_role;

-- Daily schedule, same time as the existing date-reminders job. Calling the
-- edge function with the anon key (public, non-secret — the service role
-- key stays inside the function itself via its own environment).
select cron.schedule(
  'daily-bba-reminders',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://dbwyfpupthjotgyjrttz.supabase.co/functions/v1/send-bba-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRid3lmcHVwdGhqb3RneWpydHR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDAxMjUsImV4cCI6MjEwMTYxNjEyNX0.MxyA-JBb9Cx1zTVHZoeORDbQzCcTeu7Uj3iGo_RBjZU',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
