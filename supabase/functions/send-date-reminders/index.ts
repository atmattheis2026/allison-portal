// Runs once a day on a schedule (see migration 028) — not triggered by a
// user action, so like notify-client it has no caller session to trust.
// Uses the service role key to look across every team's leads, finds
// personal-detail dates (birthdays, anniversaries, etc.) landing TODAY, and
// emails each assigned agent one digest of their own dates for the day.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? 'http://localhost:5199'
const REMINDER_DAYS_AHEAD = 0

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

interface DueReminder {
  lead_id: string
  lead_name: string
  text: string
  date_value: string
  agent_email: string
  agent_name: string | null
  team_id: string
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'email not configured' }), { status: 500, headers: corsHeaders })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: due, error } = await supabase
      .rpc('get_due_date_reminders', { p_days_ahead: REMINDER_DAYS_AHEAD })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
    }

    const rows = (due ?? []) as DueReminder[]
    if (rows.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: corsHeaders })
    }

    // One email per agent, even if they have several dates coming up.
    const byAgent = new Map<string, DueReminder[]>()
    for (const r of rows) {
      (byAgent.get(r.agent_email) ??= []).push(r)
    }

    let sent = 0
    for (const [email, reminders] of byAgent) {
      const agentName = reminders[0].agent_name || 'there'
      const items = reminders.map((r) =>
        `<li><strong>${escapeHtml(r.text || 'Untitled')}</strong> — ${escapeHtml(r.lead_name)} ` +
        `(${new Date(r.date_value).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}) ` +
        `— <a href="${APP_BASE_URL}/admin/leads/${r.lead_id}">view</a></li>`
      ).join('')

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Active Buyers <reminders@epicclosinghub.com>',
          to: [email],
          subject: reminders.length === 1
            ? `Today: ${reminders[0].text || 'a date'} — ${reminders[0].lead_name}`
            : `${reminders.length} dates today`,
          html: `<p>Hi ${escapeHtml(agentName)},</p><p>Today:</p><ul>${items}</ul>`,
          text: reminders.map((r) =>
            `${r.text || 'Untitled'} — ${r.lead_name} (${r.date_value})`
          ).join('\n'),
        }),
      })
      if (res.ok) sent++
    }

    return new Response(JSON.stringify({ sent, agents: byAgent.size }), { status: 200, headers: corsHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
