// Called from the client's own lead page when they upload their photo (or
// their co-buyer's). No session — the share token is the credential, same
// trust model as add_lead_referral/request-showing. Runs server-side with
// the service role key specifically so this works despite the 'media'
// storage bucket's insert policy being authenticated-only (see migration
// 001) — a client page has no Supabase session to be authenticated with.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token, slot, file_base64, content_type } = await req.json()
    if (!token || (slot !== 1 && slot !== 2) || !file_base64) {
      return new Response(JSON.stringify({ error: 'missing token, slot, or file' }), { status: 400, headers: corsHeaders })
    }
    // 2MB after the client-side resize is already generous — anything past
    // that this deep into base64 text is almost certainly not a photo.
    if (file_base64.length > 3_000_000) {
      return new Response(JSON.stringify({ error: 'image too large' }), { status: 400, headers: corsHeaders })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: lead } = await admin.from('leads')
      .select('id').eq('share_token', token).is('archived_at', null).maybeSingle()
    if (!lead) {
      return new Response(JSON.stringify({ error: 'this link is not active' }), { status: 404, headers: corsHeaders })
    }

    const ext = (content_type ?? 'image/jpeg').split('/')[1] ?? 'jpg'
    const path = `leads/${lead.id}-${slot}-${Date.now()}.${ext}`
    const { error: uploadErr } = await admin.storage.from('media')
      .upload(path, decodeBase64(file_base64), { contentType: content_type ?? 'image/jpeg', upsert: true })
    if (uploadErr) {
      return new Response(JSON.stringify({ error: uploadErr.message }), { status: 500, headers: corsHeaders })
    }

    const { data: pub } = admin.storage.from('media').getPublicUrl(path)
    const column = slot === 1 ? 'client_photo_url' : 'client_photo_url_2'
    await admin.from('leads').update({ [column]: pub.publicUrl }).eq('id', lead.id)

    return new Response(JSON.stringify({ url: pub.publicUrl }), { status: 200, headers: corsHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
