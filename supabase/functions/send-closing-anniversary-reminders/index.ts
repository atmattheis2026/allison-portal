// Runs once a day on a schedule (see migration 051) — not triggered by a
// user action, so like the other reminder functions it has no caller
// session to trust. Uses the service role key to look across every team's
// closed leads, finds closing-date anniversaries landing TODAY, and emails
// both the assigned agent and the assigned lender a nudge to send the
// client a happy-anniversary note themselves — this is a reminder for the
// team, not an email to the client.

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

interface DueAnniversary {
  lead_id: string
  lead_name: string
  lead_name_2: string | null
  closed_date: string
  recipient_email: string
  recipient_name: string | null
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
      .rpc('get_due_closing_anniversaries', { p_days_ahead: REMINDER_DAYS_AHEAD })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
    }

    const rows = (due ?? []) as DueAnniversary[]
    if (rows.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: corsHeaders })
    }

    // One email per recipient, even if they have several closing
    // anniversaries landing on the same day.
    const byRecipient = new Map<string, DueAnniversary[]>()
    for (const r of rows) {
      const list = byRecipient.get(r.recipient_email) ?? []
      list.push(r)
      byRecipient.set(r.recipient_email, list)
    }

    let sent = 0
    for (const [email, anniversaries] of byRecipient) {
      const recipientName = anniversaries[0].recipient_name || 'there'
      const items = anniversaries.map((a) => {
        const names = [a.lead_name, a.lead_name_2].filter(Boolean).join(' & ')
        const years = new Date().getFullYear() - new Date(a.closed_date + 'T00:00:00').getFullYear()
        return `<li>Send happy closing anniversary email to <strong>${escapeHtml(names)}</strong>` +
          `${years > 0 ? ` (${years} year${years === 1 ? '' : 's'})` : ''} — ` +
          `<a href="${APP_BASE_URL}/admin/leads/${a.lead_id}">view</a></li>`
      }).join('')

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Active Buyers <reminders@epicclosinghub.com>',
          to: [email],
          subject: anniversaries.length === 1
            ? `🎉 Send happy closing anniversary email to ${[anniversaries[0].lead_name, anniversaries[0].lead_name_2].filter(Boolean).join(' & ')}`
            : `🎉 ${anniversaries.length} closing anniversaries today`,
          html: `<p>Hi ${escapeHtml(recipientName)},</p><p>Today:</p><ul>${items}</ul>`,
          text: anniversaries.map((a) =>
            `Send happy closing anniversary email to ${[a.lead_name, a.lead_name_2].filter(Boolean).join(' & ')}`
          ).join('\n'),
        }),
      })
      if (res.ok) sent++
    }

    return new Response(JSON.stringify({ sent, recipients: byRecipient.size }), { status: 200, headers: corsHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
