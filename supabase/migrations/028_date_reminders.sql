-- Backs the send-date-reminders edge function: finds personal-detail dates
-- (birthdays, anniversaries, etc.) whose yearly recurrence lands exactly
-- p_days_ahead days from today, for whichever agent is assigned to that
-- lead. Handles the December -> January wraparound by checking both this
-- year's and next year's occurrence of the month/day.
--
-- Runs as a scheduled job with no signed-in user (same situation as
-- notify-client), so this is SECURITY DEFINER and looks across every team on
-- purpose — the edge function calling it already uses the service role key.
--
-- Known simplification: "today" is the database's own current_date (UTC),
-- not each agent's local timezone — a date could fire up to a day off
-- depending on time zone. Fine for a reminder; not worth the complexity to
-- track per-agent timezones for this.
create or replace function get_due_date_reminders(p_days_ahead int default 0)
returns table (
  lead_id uuid, lead_name text, text text, date_value date,
  agent_email text, agent_name text, team_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with occurrences as (
    select
      pn.lead_id, l.full_name as lead_name, pn.text, pn.date_value,
      m.email as agent_email, m.full_name as agent_name, l.team_id,
      make_date(extract(year from current_date)::int,
                extract(month from pn.date_value)::int,
                extract(day from pn.date_value)::int) as this_year_date
    from lead_personal_notes pn
    join leads l on l.id = pn.lead_id
    join team_members m on m.id = l.realtor_member_id
   where pn.date_value is not null
     and m.email is not null
     and l.archived_at is null
  )
  select lead_id, lead_name, text, date_value, agent_email, agent_name, team_id
    from occurrences
   where (this_year_date - current_date) = p_days_ahead
      or ((this_year_date + interval '1 year')::date - current_date) = p_days_ahead
$$;

revoke all on function get_due_date_reminders(int) from public, anon, authenticated;
grant execute on function get_due_date_reminders(int) to service_role;

-- Daily schedule, calling the edge function with the anon key (a public,
-- non-secret value — never the service role key, which stays inside the
-- function itself via its own environment). 13:00 UTC ≈ 8–9am Eastern.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'daily-date-reminders',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://dbwyfpupthjotgyjrttz.supabase.co/functions/v1/send-date-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRid3lmcHVwdGhqb3RneWpydHR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDAxMjUsImV4cCI6MjEwMTYxNjEyNX0.MxyA-JBb9Cx1zTVHZoeORDbQzCcTeu7Uj3iGo_RBjZU',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
