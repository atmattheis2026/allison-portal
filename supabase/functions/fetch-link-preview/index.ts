// Called when Allison (or an agent) pastes a listing URL into "Homes shown",
// "Homes you may like", or an Appointment, and the photo/address fields are
// still empty. Fetches the page and pulls its Open Graph image and title —
// the same preview a listing site already shows when its link is pasted
// into iMessage or Facebook. The title stands in for typing the address by
// hand (it's usually something like "123 Main St - Zillow").
//
// Not every site cooperates: some (Zillow especially) block automated
// requests entirely. That's expected and not an error worth surfacing loudly
// — the frontend just leaves the photo field for Allison to paste by hand
// when this comes back empty.
//
// Requires a signed-in session, same reasoning as send-team-invite: this is
// a fetch-anything-on-the-internet proxy, and it shouldn't be open to
// anonymous callers.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

function extractImage(html: string): string | null {
  const metaTag = (prop: string) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i',
    )
    const m1 = html.match(re)
    if (m1) return m1[1]
    // Some pages put content= before property=/name=.
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i',
    )
    return html.match(re2)?.[1] ?? null
  }
  return metaTag('og:image') || metaTag('twitter:image')
}

function extractTitle(html: string): string | null {
  const og = html.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:title["']/i)
  if (og) return og[1]
  const titleTag = html.match(/<title>([^<]+)<\/title>/i)
  return titleTag ? titleTag[1].trim() : null
}

/**
 * Best-effort only — HOA/tax/school district/county aren't standard meta
 * tags like og:image, so this just greps the raw page text for common
 * phrasing. Works on sites that render this info server-side into the HTML;
 * comes back empty on anything that loads it in via client-side JS after
 * the page loads (which a plain fetch() never sees), Zillow chief among them.
 * Whatever comes back empty, the agent fills in by hand — this is a
 * head start, not a guarantee.
 */
function extractHomeFacts(html: string): {
  hoa_fee: string | null; property_tax: string | null
  school_district: string | null; county: string | null
} {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
  const money = String.raw`\$[\d,]+(?:\.\d+)?(?:\s*\/\s*(?:mo|month|yr|year))?`

  const hoa = text.match(new RegExp(`HOA[^$]{0,25}(${money})`, 'i'))
  const tax = text.match(new RegExp(`Property\\s*Tax(?:es)?[^$]{0,25}(${money})`, 'i'))
  const school = text.match(/School\s*District[:\s]+([A-Za-z0-9.' -]{3,60}?)(?:[.,]|\s{2}|$)/i)
  const county = text.match(/([A-Z][a-zA-Z]+)\s+County\b/)

  return {
    hoa_fee: hoa?.[1] ?? null,
    property_tax: tax?.[1] ?? null,
    school_district: school?.[1]?.trim() ?? null,
    county: county ? `${county[1]} County` : null,
  }
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
    const { data: { user } } = await asCaller.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'not signed in' }), { status: 401, headers: corsHeaders })
    }

    const { url } = await req.json()
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'missing url' }), { status: 400, headers: corsHeaders })
    }

    const res = await fetch(url, {
      headers: {
        // A plain server-side User-Agent gets blocked by more sites than a
        // browser-like one does — this is the difference between "works
        // sometimes" and "works almost never" for this feature.
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ photo_url: null, reason: `site returned ${res.status}` }),
        { status: 200, headers: corsHeaders })
    }

    const html = await res.text()
    const photoUrl = extractImage(html)
    const title = extractTitle(html)
    const facts = extractHomeFacts(html)
    return new Response(JSON.stringify({ photo_url: photoUrl, title, ...facts }), { status: 200, headers: corsHeaders })
  } catch (e) {
    // Timeouts, blocked requests, malformed URLs — all non-fatal for the
    // caller, which just falls back to manual entry.
    return new Response(JSON.stringify({
      photo_url: null, title: null, hoa_fee: null, property_tax: null,
      school_district: null, county: null, reason: String(e),
    }), { status: 200, headers: corsHeaders })
  }
})
