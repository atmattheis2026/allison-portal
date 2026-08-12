// Fallback for when fetch-link-preview's direct read of the listing link
// comes back empty — Zillow and several other sites block a plain server
// fetch outright, so there's often nothing to parse no matter how good the
// address is. Instead of paying for a property-data API, this searches the
// open web for the address (no API key, no account, no cost) and tries a
// few of the results instead of the one blocked link — a county assessor
// page, Redfin, Realtor.com, etc. often aren't blocked the same way.
//
// Still best-effort, same as fetch-link-preview: property tax pages in
// particular vary wildly in format county to county, so this often comes
// back with less than a human would find in two minutes of clicking
// around. That's exactly why the Home Info disclaimer exists regardless of
// which path found the number — always worth a glance before trusting it.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Known to block a plain server fetch — not worth the round trip.
const SKIP_DOMAINS = ['zillow.com']

/** Same patterns as fetch-link-preview — kept as its own small copy rather
 *  than a shared module, since these two functions deploy independently. */
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

/** DuckDuckGo's no-JS results page — server-rendered HTML, no API key.
 *  Result links are wrapped in a redirect ("/l/?uddg=<encoded-url>"), so
 *  each one needs decoding to get the real destination. */
function extractSearchResultUrls(html: string, limit: number): string[] {
  const urls: string[] = []
  const re = /class="result__a"[^>]*href="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && urls.length < limit) {
    let href = m[1]
    const uddgMatch = href.match(/[?&]uddg=([^&]+)/)
    if (uddgMatch) href = decodeURIComponent(uddgMatch[1])
    try {
      const host = new URL(href).hostname.replace(/^www\./, '')
      if (SKIP_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) continue
      urls.push(href)
    } catch {
      // malformed URL — skip it
    }
  }
  return urls
}

async function fetchPage(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
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

    const { address } = await req.json()
    if (!address || typeof address !== 'string' || !address.trim()) {
      return new Response(JSON.stringify({ error: 'missing address' }), { status: 400, headers: corsHeaders })
    }

    const query = `${address.trim()} property tax HOA fee`
    const searchHtml = await fetchPage(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, 8000)
    if (!searchHtml) {
      return new Response(JSON.stringify({
        hoa_fee: null, property_tax: null, school_district: null, county: null, source_url: null,
      }), { status: 200, headers: corsHeaders })
    }

    const candidates = extractSearchResultUrls(searchHtml, 4)
    const pages = await Promise.all(candidates.map((u) => fetchPage(u, 6000)))

    for (let i = 0; i < pages.length; i++) {
      const html = pages[i]
      if (!html) continue
      const facts = extractHomeFacts(html)
      if (facts.hoa_fee || facts.property_tax) {
        return new Response(JSON.stringify({ ...facts, source_url: candidates[i] }),
          { status: 200, headers: corsHeaders })
      }
    }

    // Nothing with HOA/tax specifically — still return whatever school
    // district/county turned up, from the first page that had anything at all.
    for (let i = 0; i < pages.length; i++) {
      const html = pages[i]
      if (!html) continue
      const facts = extractHomeFacts(html)
      if (facts.school_district || facts.county) {
        return new Response(JSON.stringify({ ...facts, source_url: candidates[i] }),
          { status: 200, headers: corsHeaders })
      }
    }

    return new Response(JSON.stringify({
      hoa_fee: null, property_tax: null, school_district: null, county: null, source_url: null,
    }), { status: 200, headers: corsHeaders })
  } catch (e) {
    return new Response(JSON.stringify({
      hoa_fee: null, property_tax: null, school_district: null, county: null, source_url: null,
      reason: String(e),
    }), { status: 200, headers: corsHeaders })
  }
})
