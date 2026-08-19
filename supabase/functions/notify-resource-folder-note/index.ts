// Called right after a Home Page folder note is inserted, only when the
// person posting it checked "notify people about this one" — see migration
// 067. There's no digest, no per-person opt-in list; this fires once, for
// this one note, to everyone currently granted access to that folder.
//
// Requires a signed-in session, same reasoning as send-team-invite — this
// only ever runs on behalf of whoever's actually clicking "Post," not a
// database trigger with no user attached. The note must already exist
// (inserted under normal RLS) before this is called, so by the time this
// runs, access has already been checked once; this just needs to confirm
// the note belongs to the caller's own team before emailing anyone about it.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
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

function renderNoteEmail(opts: {
  brandName: string; accentHex: string; folderName: string
  authorName: string; body: string; link: string
}): string {
  const { brandName, accentHex, folderName, authorName, body, link } = opts
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
                <div style="font-size:22px; color:#1a1a1a; line-height:1.3;">
                  New note in "${escapeHtml(folderName)}"
                </div>
                <div style="font-size:13px; color:#8a8578; margin-top:6px; font-family:Helvetica,Arial,sans-serif;">
                  ${escapeHtml(authorName)}
                </div>
                <div style="font-size:15px; color:#3a362c; margin-top:14px; line-height:1.6; font-family:Helvetica,Arial,sans-serif; white-space:pre-wrap;">
                  ${escapeHtml(body)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 32px 34px;" align="center">
                <a href="${link}"
                   style="display:inline-block; background:${accentHex}; color:#0c1017; text-decoration:none;
                          font-family:Helvetica,Arial,sans-serif; font-size:14px; font-weight:bold;
                          letter-spacing:.03em; padding:13px 28px; border-radius:6px;">
                  Open Home Page
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'missing auth' }), { status: 401, headers: corsHeaders })
    }
    const asCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await asCaller.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'not signed in' }), { status: 401, headers: corsHeaders })
    }

    const { folder_note_id } = await req.json()
    if (!folder_note_id) {
      return new Response(JSON.stringify({ error: 'missing folder_note_id' }), { status: 400, headers: corsHeaders })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: me } = await admin.from('profiles').select('team_id').eq('id', user.id).single()
    if (!me?.team_id) {
      return new Response(JSON.stringify({ error: 'you have no team' }), { status: 403, headers: corsHeaders })
    }

    const { data: note } = await admin.from('resource_folder_notes')
      .select('id, folder_id, author_name, body, notified').eq('id', folder_note_id).single()
    if (!note) {
      return new Response(JSON.stringify({ error: 'note not found' }), { status: 404, headers: corsHeaders })
    }

    const { data: folder } = await admin.from('resource_folders')
      .select('id, team_id, name').eq('id', note.folder_id).single()
    if (!folder || folder.team_id !== me.team_id) {
      return new Response(JSON.stringify({ error: 'not your folder' }), { status: 403, headers: corsHeaders })
    }

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'email not configured' }), { status: 500, headers: corsHeaders })
    }

    // Recipients: everyone explicitly granted access to this folder — a mix
    // of team members and mentors, each looked up for their email. Not the
    // whole team, and not the poster themselves.
    const { data: grants } = await admin.from('resource_folder_access')
      .select('team_member_id, mentor_id').eq('folder_id', folder.id)

    const memberIds = (grants ?? []).map((g) => g.team_member_id).filter((v): v is string => Boolean(v))
    const mentorIds = (grants ?? []).map((g) => g.mentor_id).filter((v): v is string => Boolean(v))

    const [{ data: members }, { data: mentors }] = await Promise.all([
      memberIds.length
        ? admin.from('team_members').select('email, profile_id').in('id', memberIds)
        : Promise.resolve({ data: [] as { email: string | null; profile_id: string | null }[] }),
      mentorIds.length
        ? admin.from('mentors').select('email, profile_id').in('id', mentorIds)
        : Promise.resolve({ data: [] as { email: string | null; profile_id: string | null }[] }),
    ])

    const recipients = [...(members ?? []), ...(mentors ?? [])]
      .filter((p) => p.email && p.profile_id !== user.id)
      .map((p) => p.email!) as string[]
    const uniqueRecipients = [...new Set(recipients)]

    if (uniqueRecipients.length === 0) {
      // Nobody to notify (e.g., the only grant is the poster themselves) —
      // not an error, just nothing to do.
      return new Response(JSON.stringify({ sent: true, recipients: 0 }), { status: 200, headers: corsHeaders })
    }

    const { data: brand } = await admin.from('brands')
      .select('name, wordmark_text, accent_hex')
      .eq('team_id', folder.team_id).eq('kind', 'real_estate').maybeSingle()
    const brandName = brand?.name || brand?.wordmark_text || 'Your Team'
    const accentHex = brand?.accent_hex || '#C9A44C'
    const link = `${APP_BASE_URL}/admin/resources`

    const html = renderNoteEmail({
      brandName, accentHex, folderName: folder.name,
      authorName: note.author_name || 'Someone', body: note.body, link,
    })
    const text = `${note.author_name || 'Someone'} posted a note in "${folder.name}":\n\n${note.body}\n\nOpen Home Page: ${link}`

    const results = await Promise.all(uniqueRecipients.map((to) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${brandName} <updates@epicclosinghub.com>`,
          to: [to],
          subject: `New note in "${folder.name}"`,
          html, text,
        }),
      }),
    ))

    const sentCount = results.filter((r) => r.ok).length
    await admin.from('resource_folder_notes').update({ notified: sentCount > 0 }).eq('id', note.id)

    return new Response(JSON.stringify({ sent: true, recipients: sentCount, attempted: uniqueRecipients.length }),
      { status: 200, headers: corsHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
