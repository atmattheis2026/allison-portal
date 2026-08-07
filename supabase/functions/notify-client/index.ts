// Fires when someone posts a message-board update on a transaction. Looks up
// the client's email (Buyers for buy/loan deals, Sellers for listings) and
// sends them a short "there's an update" email with a link to their page.
//
// Uses the service role key (auto-provided to every Edge Function) to read
// past RLS — this function never receives or trusts anything from the client,
// only from our own database trigger.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Where the client link points. Update this once the app has a real public
// address — until then, links in the email won't be reachable off her Mac.
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? 'http://localhost:5199'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderEmail(opts: {
  brandName: string; accentHex: string
  addressLine: string; cityStateZip: string
  who: string; body: string; link: string
}): string {
  const { brandName, accentHex, addressLine, cityStateZip, who, body, link } = opts
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
                <div style="font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:${accentHex}; margin-bottom:6px; font-family:Helvetica,Arial,sans-serif;">
                  Transaction Update
                </div>
                <div style="font-size:26px; color:#1a1a1a; line-height:1.25;">
                  ${escapeHtml(addressLine)}
                </div>
                <div style="font-size:14px; color:#8a8578; margin-top:2px;">
                  ${escapeHtml(cityStateZip)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 8px;">
                <div style="font-size:13px; color:#8a8578; margin-bottom:8px; font-family:Helvetica,Arial,sans-serif;">
                  ${escapeHtml(who)}
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f2; border-left:3px solid ${accentHex}; border-radius:4px;">
                  <tr>
                    <td style="padding:16px 18px; font-size:15px; line-height:1.6; color:#2b2b2b; font-family:Helvetica,Arial,sans-serif;">
                      ${escapeHtml(body).replace(/\n/g, '<br>')}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 32px 34px;" align="center">
                <a href="${link}"
                   style="display:inline-block; background:${accentHex}; color:#0c1017; text-decoration:none;
                          font-family:Helvetica,Arial,sans-serif; font-size:14px; font-weight:bold;
                          letter-spacing:.03em; padding:13px 28px; border-radius:6px;">
                  View Your Transaction
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 26px;" align="center">
                <div style="font-size:11px; color:#b3ada0; font-family:Helvetica,Arial,sans-serif;">
                  This link is unique to you — please don't forward it.
                </div>
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
    const { record } = await req.json()
    const noteId: string = record.id
    const transactionId: string = record.transaction_id
    const authorName: string | null = record.author_name
    const body: string = record.body

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('address_line, city_state_zip, deal_type, share_token, team_id')
      .eq('id', transactionId)
      .single()
    if (txErr || !tx) {
      return new Response(JSON.stringify({ skipped: 'transaction not found', noteId }), { status: 200 })
    }

    // Who the client is depends on which side of the deal this is.
    const clientRole = tx.deal_type === 'sell' ? 'Sellers' : 'Buyers'
    const { data: contact } = await supabase
      .from('contacts')
      .select('email, name')
      .eq('transaction_id', transactionId)
      .eq('role_label', clientRole)
      .maybeSingle()

    if (!contact?.email) {
      return new Response(JSON.stringify({ skipped: 'no client email on file', noteId }), { status: 200 })
    }

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not set — cannot send email')
      return new Response(JSON.stringify({ error: 'email not configured' }), { status: 500 })
    }

    const { data: brand } = await supabase
      .from('brands')
      .select('name, wordmark_text, accent_hex')
      .eq('team_id', tx.team_id)
      .eq('kind', 'real_estate')
      .maybeSingle()

    const brandName = brand?.name || brand?.wordmark_text || 'Your Real Estate Team'
    const accentHex = brand?.accent_hex || '#C9A44C'
    const link = `${APP_BASE_URL}/t/${tx.share_token}`
    const who = authorName ? `${authorName} posted an update:` : 'A new update was posted:'

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${brandName} <updates@epicclosinghub.com>`,
        to: [contact.email],
        subject: `Update on ${tx.address_line}`,
        html: renderEmail({
          brandName, accentHex,
          addressLine: tx.address_line, cityStateZip: tx.city_state_zip,
          who, body, link,
        }),
        text:
          `${who}\n\n"${body}"\n\n` +
          `View your transaction: ${link}`,
      }),
    })

    if (!emailRes.ok) {
      const errText = await emailRes.text()
      console.error('Resend send failed', errText)
      return new Response(JSON.stringify({ error: 'send failed', detail: errText }), { status: 500 })
    }

    return new Response(JSON.stringify({ sent: true, to: contact.email }), { status: 200 })
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
