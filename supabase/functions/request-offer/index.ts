// Called from the client's own lead page (/l/:token) when they click
// "Let's make an offer!" on a completed appointment. No session at all —
// the share token IS the credential, same trust model as request-showing.
// Notifies both the assigned agent and (if set) the assigned lender.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? 'http://localhost:5199'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token, appointment_id } = await req.json()
    if (!token || !appointment_id) {
      return new Response(JSON.stringify({ error: 'missing token or appointment_id' }), { status: 400, headers: corsHeaders })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: lead } = await admin.from('leads')
      .select('id, full_name, realtor_member_id, lender_member_id')
      .eq('share_token', token).is('archived_at', null).maybeSingle()
    if (!lead) {
      return new Response(JSON.stringify({ error: 'this link is not active' }), { status: 404, headers: corsHeaders })
    }

    const { data: apt } = await admin.from('lead_appointments')
      .select('id, address_line').eq('id', appointment_id).eq('lead_id', lead.id).maybeSingle()
    if (!apt) {
      return new Response(JSON.stringify({ error: 'that appointment is not on this list' }), { status: 404, headers: corsHeaders })
    }

    await admin.from('lead_appointments')
      .update({ offer_requested: true, offer_requested_at: new Date().toISOString() })
      .eq('id', appointment_id)

    // Email is a nice-to-have here, not the source of truth — the flag on
    // the appointment is what the agent actually sees, so a missing key or
    // a failed send still counts as success for the client.
    if (RESEND_API_KEY) {
      const memberIds = [lead.realtor_member_id, lead.lender_member_id].filter(Boolean) as string[]
      if (memberIds.length) {
        const { data: recipients } = await admin.from('team_members')
          .select('full_name, email').in('id', memberIds)
        for (const person of recipients ?? []) {
          if (!person.email) continue
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Active Buyers <reminders@epicclosinghub.com>',
              to: [person.email],
              subject: `${lead.full_name} wants to make an offer on ${apt.address_line || 'a home'}`,
              html: `<p>Hi ${escapeHtml(person.full_name || 'there')},</p>` +
                `<p><strong>${escapeHtml(lead.full_name)}</strong> just clicked "Let's make an offer!" for ` +
                `<strong>${escapeHtml(apt.address_line || 'a home on their list')}</strong>.</p>` +
                `<p><a href="${APP_BASE_URL}/admin/leads/${lead.id}">Open their page</a> to follow up.</p>`,
              text: `${lead.full_name} wants to make an offer on ${apt.address_line || 'a home'}. ` +
                `Open their page to follow up: ${APP_BASE_URL}/admin/leads/${lead.id}`,
            }),
          })
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
