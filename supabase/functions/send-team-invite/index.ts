// Called from Settings > Team when Allison clicks "Send Invite" next to a
// person. Emails that person her team's invite code directly — no separate
// email client, no copy-pasting.
//
// Requires a valid signed-in session (unlike notify-client, which is fired by
// a database trigger with no user attached) — this one only ever runs on
// behalf of whoever's actually clicking the button, and only for someone on
// their own team.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? 'http://localhost:5199'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderInviteEmail(opts: {
  brandName: string; accentHex: string; memberName: string
  inviteCode: string; loginLink: string
}): string {
  const { brandName, accentHex, memberName, inviteCode, loginLink } = opts
  return `
<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#f4f2ee; font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background:#ffffff; border-radius:10px; overflow:hidden; border:1px solid #e7e2d8;">
            <tr>
              <td style="background:#0c1017; padding:22px 32px;">
                <div style="color:${accentHex}; font-size:13px; letter-spacing:.22em; text-transform:uppercase; font-family:Georgia,serif;">
                  ${escapeHtml(brandName)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px;">
                <div style="font-size:24px; color:#1a1a1a; line-height:1.3;">
                  You're invited, ${escapeHtml(memberName)}
                </div>
                <div style="font-size:15px; color:#5c5748; margin-top:10px; line-height:1.6; font-family:Helvetica,Arial,sans-serif;">
                  You've been added to ${escapeHtml(brandName)}'s transaction portal.
                  Sign in with this email address, choose "I have an invite code," and enter the code below.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 8px;" align="center">
                <div style="display:inline-block; font-family:Georgia,serif; font-size:26px; letter-spacing:.1em;
                            color:${accentHex}; border:1px solid ${accentHex}; border-radius:999px; padding:12px 28px;">
                  ${escapeHtml(inviteCode)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 32px 34px;" align="center">
                <a href="${loginLink}"
                   style="display:inline-block; background:${accentHex}; color:#0c1017; text-decoration:none;
                          font-family:Helvetica,Arial,sans-serif; font-size:14px; font-weight:bold;
                          letter-spacing:.03em; padding:13px 28px; border-radius:6px;">
                  Sign In to Get Started
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'missing auth' }), { status: 401 })

    const asCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await asCaller.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'not signed in' }), { status: 401 })
    }

    const { team_member_id } = await req.json()
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: me } = await admin.from('profiles').select('team_id').eq('id', user.id).single()
    if (!me?.team_id) {
      return new Response(JSON.stringify({ error: 'you have no team' }), { status: 403 })
    }

    const { data: member } = await admin.from('team_members')
      .select('id, full_name, email, team_id').eq('id', team_member_id).single()
    if (!member || member.team_id !== me.team_id) {
      return new Response(JSON.stringify({ error: 'not someone on your team' }), { status: 403 })
    }
    if (!member.email) {
      return new Response(JSON.stringify({ error: 'no email on file for this person' }), { status: 400 })
    }
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'email not configured' }), { status: 500 })
    }

    const { data: team } = await admin.from('teams')
      .select('name, invite_code').eq('id', me.team_id).single()
    const { data: brand } = await admin.from('brands')
      .select('name, wordmark_text, accent_hex')
      .eq('team_id', me.team_id).eq('kind', 'real_estate').maybeSingle()

    const brandName = brand?.name || brand?.wordmark_text || team?.name || 'Your Team'
    const accentHex = brand?.accent_hex || '#C9A44C'
    const inviteCode = team?.invite_code ?? ''
    const loginLink = `${APP_BASE_URL}/login`

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${brandName} <onboarding@resend.dev>`,
        to: [member.email],
        subject: `You're invited to join ${brandName}`,
        html: renderInviteEmail({
          brandName, accentHex, memberName: member.full_name || 'there', inviteCode, loginLink,
        }),
        text:
          `You've been added to ${brandName}'s transaction portal.\n\n` +
          `Sign in at ${loginLink} with ${member.email}, choose "I have an invite code," ` +
          `and enter: ${inviteCode}`,
      }),
    })

    if (!emailRes.ok) {
      const errText = await emailRes.text()
      return new Response(JSON.stringify({ error: 'send failed', detail: errText }), { status: 500 })
    }

    return new Response(JSON.stringify({ sent: true, to: member.email }), { status: 200 })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
