// Runs once a day on a schedule (see migration 050) — not triggered by a
// user action, so like send-date-reminders it has no caller session to
// trust. Uses the service role key to look across every team's leads,
// finds signed buyer broker agreements expiring in exactly 7 days, and
// emails each assigned agent an urgent (red) heads-up per lead.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? 'http://localhost:5199'
const REMINDER_DAYS_AHEAD = 7

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

interface DueBbaReminder {
  lead_id: string
  lead_name: string
  expires: string
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
      .rpc('get_due_bba_reminders', { p_days_ahead: REMINDER_DAYS_AHEAD })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
    }

    const rows = (due ?? []) as DueBbaReminder[]
    if (rows.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: corsHeaders })
    }

    let sent = 0
    for (const r of rows) {
      const agentName = r.agent_name || 'there'
      const expiresText = new Date(r.expires + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      })

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Active Buyers <reminders@epicclosinghub.com>',
          to: [r.agent_email],
          subject: `⚠️ Active client BBA about to expire — ${r.lead_name}`,
          html:
            `<div style="border:2px solid #e5322d;border-radius:8px;padding:16px;font-family:sans-serif;">` +
            `<p style="color:#e5322d;font-weight:700;font-size:16px;margin:0 0 10px;">` +
            `Active client BBA about to expire</p>` +
            `<p style="margin:0 0 10px;">Hi ${escapeHtml(agentName)},</p>` +
            `<p style="margin:0 0 10px;"><strong>${escapeHtml(r.lead_name)}</strong>'s buyer broker ` +
            `agreement expires <strong style="color:#e5322d;">${expiresText}</strong> — 7 days from now.</p>` +
            `<p style="margin:0;"><a href="${APP_BASE_URL}/admin/leads/${r.lead_id}" ` +
            `style="color:#e5322d;font-weight:700;">Open their page</a> to follow up before it lapses.</p>` +
            `</div>`,
          text: `Active client BBA about to expire: ${r.lead_name}'s buyer broker agreement expires ` +
            `${expiresText} (7 days from now). Open their page to follow up: ` +
            `${APP_BASE_URL}/admin/leads/${r.lead_id}`,
        }),
      })
      if (res.ok) sent++
    }

    return new Response(JSON.stringify({ sent }), { status: 200, headers: corsHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
