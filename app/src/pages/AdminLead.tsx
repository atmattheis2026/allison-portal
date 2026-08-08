import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { Lead, LeadAppointment, LeadHome, LeadMaybeHome, LeadPriority, LeadPersonalNote, LeadReferral, LeadNote, TeamMember } from '../lib/types'
import {
  leadTimeframeBand, TIMEFRAME_BAND_COLOR, TIMEFRAME_BAND_LABEL, REFERRAL_SOURCES, BUDGET_RANGES,
  parseAddressFromListingUrl,
} from '../lib/types'
import AdminNav from '../components/AdminNav'
import './Admin.css'

/** Days from today to a plain "YYYY-MM-DD" date — negative once it's past. */
function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

/** datetime-local wants "YYYY-MM-DDTHH:mm" in local time, not an ISO string. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Small square preview so the agent sees at a glance what the client sees,
 *  without opening the client link to check. */
function Thumb({ src }: { src: string | null }) {
  return (
    <div style={{
      width: 64, height: 64, borderRadius: 8, flex: 'none', overflow: 'hidden',
      background: 'var(--panel)', border: `1px ${src ? 'solid' : 'dashed'} var(--line)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {src
        ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span className="muted" style={{ fontSize: 9, textAlign: 'center', lineHeight: 1.2 }}>No photo</span>}
    </div>
  )
}

export default function AdminLead() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()

  const [lead, setLead] = useState<Lead | null>(null)
  const [roster, setRoster] = useState<TeamMember[]>([])
  const [appointments, setAppointments] = useState<LeadAppointment[]>([])
  const [homes, setHomes] = useState<LeadHome[]>([])
  const [maybeHomes, setMaybeHomes] = useState<LeadMaybeHome[]>([])
  const [priorities, setPriorities] = useState<LeadPriority[]>([])
  const [personalNotes, setPersonalNotes] = useState<LeadPersonalNote[]>([])
  const [referrals, setReferrals] = useState<LeadReferral[]>([])
  const [notes, setNotes] = useState<LeadNote[]>([])
  const [copied, setCopied] = useState(false)
  const [converting, setConverting] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [saveFlash, setSaveFlash] = useState(false)
  const [fetchingId, setFetchingId] = useState<string | null>(null)

  // Every field on this page saves the instant it changes — there's no Save
  // button to click. This just gives a brief visible confirmation so that's
  // obvious, rather than changes happening silently in the background.
  function flashSaved() {
    setSaveFlash(true)
    setTimeout(() => setSaveFlash(false), 1200)
  }

  useEffect(() => {
    if (DEMO_MODE || !supabase || !id) return

    supabase.from('leads').select('*').eq('id', id).single()
      .then(({ data }) => setLead(data as Lead))
    supabase.from('team_members').select('*').order('sort_order')
      .then(({ data }) => setRoster((data as TeamMember[]) ?? []))
    supabase.from('lead_appointments').select('*').eq('lead_id', id).order('sort_order')
      .then(({ data }) => setAppointments((data as LeadAppointment[]) ?? []))
    supabase.from('lead_homes').select('*').eq('lead_id', id).order('sort_order')
      .then(({ data }) => setHomes((data as LeadHome[]) ?? []))
    supabase.from('lead_maybe_homes').select('*').eq('lead_id', id).order('sort_order')
      .then(({ data }) => setMaybeHomes((data as LeadMaybeHome[]) ?? []))
    supabase.from('lead_priorities').select('*').eq('lead_id', id).order('sort_order')
      .then(({ data }) => setPriorities((data as LeadPriority[]) ?? []))
    supabase.from('lead_personal_notes').select('*').eq('lead_id', id).order('sort_order')
      .then(({ data }) => setPersonalNotes((data as LeadPersonalNote[]) ?? []))
    supabase.from('lead_referrals').select('*').eq('lead_id', id).order('created_at')
      .then(({ data }) => setReferrals((data as LeadReferral[]) ?? []))
    supabase.from('lead_notes').select('*').eq('lead_id', id).order('created_at', { ascending: false })
      .then(({ data }) => setNotes((data as LeadNote[]) ?? []))
  }, [id])

  async function patchLead(values: Partial<Lead>) {
    setLead((cur) => (cur ? { ...cur, ...values } : cur))
    if (DEMO_MODE || !supabase || !id) return
    await supabase.from('leads').update(values).eq('id', id)
    flashSaved()
  }

  // A deliberate button click, not a background blur handler — that was too
  // easy to miss when it didn't find anything. Best-effort either way:
  // plenty of sites (Zillow especially) block this, and when that happens
  // the fields just stay empty for manual entry, with a clear message
  // instead of silence.
  async function fetchListingPreview(rowId: string, url: string): Promise<{ photo_url?: string; title?: string } | null> {
    if (!supabase || !url.trim()) return null
    setFetchingId(rowId)
    const { data } = await supabase.functions.invoke('fetch-link-preview', { body: { url } })
    setFetchingId(null)
    if (data?.photo_url || data?.title) {
      return { photo_url: data.photo_url ?? undefined, title: data.title ?? undefined }
    }
    return null
  }

  function copyLink() {
    if (!lead) return
    navigator.clipboard.writeText(`${window.location.origin}/l/${lead.share_token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  async function convert(homeId?: string) {
    if (!id || !supabase || converting) return
    if (!confirm('Convert this buyer to a full transaction? Use this once they’re under contract.')) return

    // The transaction page shows city/state/zip on its own line — if this
    // home never got one (common, since it's usually filled in from a
    // parsed listing link), ask once now rather than leaving it blank.
    const home = homeId ? homes.find((h) => h.id === homeId) : undefined
    if (home && !home.city_state_zip?.trim()) {
      const csz = prompt('City, state, zip for this home?', '')
      if (csz && csz.trim()) await patchHome(home.id, { city_state_zip: csz.trim() })
    }

    setConverting(true)
    const { data: txId, error } = await supabase.rpc('convert_lead_to_transaction', {
      p_lead_id: id, p_home_id: homeId ?? null,
    })
    setConverting(false)
    if (error || !txId) { alert(error?.message ?? 'Could not convert this lead.'); return }
    nav(`/admin/t/${txId}`)
  }

  // ---- appointments ----
  async function addAppointment() {
    if (!id || !supabase) return
    const { data } = await supabase.from('lead_appointments')
      .insert({ lead_id: id, sort_order: appointments.length }).select('*').single()
    if (data) setAppointments((cur) => [...cur, data as LeadAppointment])
  }
  async function patchAppointment(aptId: string, values: Partial<LeadAppointment>) {
    setAppointments((cur) => cur.map((a) => (a.id === aptId ? { ...a, ...values } : a)))
    if (supabase) await supabase.from('lead_appointments').update(values).eq('id', aptId)
    flashSaved()
  }
  async function removeAppointment(aptId: string) {
    setAppointments((cur) => cur.filter((a) => a.id !== aptId))
    if (supabase) await supabase.from('lead_appointments').delete().eq('id', aptId)
  }
  // Marking a showing complete copies it straight into Homes shown — the
  // appointment itself stays put (so the schedule history is intact), this
  // just stops her from retyping the same address/link/photo a second time.
  async function completeAppointment(apt: LeadAppointment) {
    if (!id || !supabase) return
    await patchAppointment(apt.id, { completed: true })
    const { data } = await supabase.from('lead_homes')
      .insert({
        lead_id: id, address_line: apt.address_line, city_state_zip: apt.city_state_zip, url: apt.url,
        photo_url: apt.photo_url, note: apt.note, sort_order: homes.length,
        shown_at: apt.scheduled_at ? apt.scheduled_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      })
      .select('*').single()
    if (data) setHomes((cur) => [...cur, data as LeadHome])
  }

  // ---- homes ----
  async function addHome() {
    if (!id || !supabase) return
    const { data } = await supabase.from('lead_homes')
      .insert({ lead_id: id, sort_order: homes.length }).select('*').single()
    if (data) setHomes((cur) => [...cur, data as LeadHome])
  }
  async function patchHome(homeId: string, values: Partial<LeadHome>) {
    setHomes((cur) => cur.map((h) => (h.id === homeId ? { ...h, ...values } : h)))
    if (supabase) await supabase.from('lead_homes').update(values).eq('id', homeId)
    flashSaved()
  }
  async function removeHome(homeId: string) {
    setHomes((cur) => cur.filter((h) => h.id !== homeId))
    if (supabase) await supabase.from('lead_homes').delete().eq('id', homeId)
  }

  // ---- homes you may like ----
  async function addMaybeHome() {
    if (!id || !supabase) return
    const { data } = await supabase.from('lead_maybe_homes')
      .insert({ lead_id: id, sort_order: maybeHomes.length }).select('*').single()
    if (data) setMaybeHomes((cur) => [...cur, data as LeadMaybeHome])
  }
  async function patchMaybeHome(mhId: string, values: Partial<LeadMaybeHome>) {
    setMaybeHomes((cur) => cur.map((h) => (h.id === mhId ? { ...h, ...values } : h)))
    if (supabase) await supabase.from('lead_maybe_homes').update(values).eq('id', mhId)
    flashSaved()
  }
  async function removeMaybeHome(mhId: string) {
    setMaybeHomes((cur) => cur.filter((h) => h.id !== mhId))
    if (supabase) await supabase.from('lead_maybe_homes').delete().eq('id', mhId)
  }
  // Moves a candidate into Homes shown — it's no longer just a maybe once
  // they've actually seen it, so this removes it from here rather than
  // leaving a copy behind in both lists.
  async function promoteMaybeHome(h: LeadMaybeHome) {
    if (!id || !supabase) return
    const { data, error } = await supabase.from('lead_homes')
      .insert({
        lead_id: id, address_line: h.address_line, city_state_zip: h.city_state_zip, url: h.url,
        photo_url: h.photo_url, note: h.note, private_note: h.private_note, sort_order: homes.length,
        shown_at: new Date().toISOString().slice(0, 10),
      })
      .select('*').single()
    if (error || !data) {
      alert(`Couldn't move that home to Homes shown: ${error?.message ?? 'unknown error'}`)
      return
    }
    setHomes((cur) => [...cur, data as LeadHome])
    setMaybeHomes((cur) => cur.filter((x) => x.id !== h.id))
    await supabase.from('lead_maybe_homes').delete().eq('id', h.id)
  }
  // Agent decides to schedule a showing for this one themselves (no client
  // request involved) — moves it out of "maybe" and into Appointments.
  async function moveMaybeHomeToAppointment(h: LeadMaybeHome) {
    if (!id || !supabase) return
    const { data, error } = await supabase.from('lead_appointments')
      .insert({
        lead_id: id, address_line: h.address_line, city_state_zip: h.city_state_zip, url: h.url,
        photo_url: h.photo_url, sort_order: appointments.length,
      })
      .select('*').single()
    if (error || !data) {
      alert(`Couldn't move that home to Appointments: ${error?.message ?? 'unknown error'}`)
      return
    }
    setAppointments((cur) => [...cur, data as LeadAppointment])
    setMaybeHomes((cur) => cur.filter((x) => x.id !== h.id))
    await supabase.from('lead_maybe_homes').delete().eq('id', h.id)
  }
  // Client asked to see this one (via the "Request a showing" button on
  // their own page) — this turns that into a real appointment and clears
  // the request badge. Leaves the candidate in this list too, in case it's
  // still worth tracking as a maybe.
  async function scheduleRequestedShowing(h: LeadMaybeHome) {
    if (!id || !supabase) return
    const { data } = await supabase.from('lead_appointments')
      .insert({
        lead_id: id, address_line: h.address_line, city_state_zip: h.city_state_zip, url: h.url,
        photo_url: h.photo_url, note: h.note, sort_order: appointments.length,
      })
      .select('*').single()
    if (data) setAppointments((cur) => [...cur, data as LeadAppointment])
    setMaybeHomes((cur) => cur.map((x) => (x.id === h.id ? { ...x, showing_requested: false } : x)))
    await supabase.from('lead_maybe_homes').update({ showing_requested: false }).eq('id', h.id)
  }

  // ---- priorities ----
  async function addPriority() {
    if (!id || !supabase) return
    const { data } = await supabase.from('lead_priorities')
      .insert({ lead_id: id, sort_order: priorities.length }).select('*').single()
    if (data) setPriorities((cur) => [...cur, data as LeadPriority])
  }
  async function patchPriority(pId: string, text: string) {
    setPriorities((cur) => cur.map((p) => (p.id === pId ? { ...p, text } : p)))
    if (supabase) await supabase.from('lead_priorities').update({ text }).eq('id', pId)
    flashSaved()
  }
  async function removePriority(pId: string) {
    setPriorities((cur) => cur.filter((p) => p.id !== pId))
    if (supabase) await supabase.from('lead_priorities').delete().eq('id', pId)
  }

  // ---- personal notes ----
  async function addPersonalNote() {
    if (!id || !supabase) return
    const { data } = await supabase.from('lead_personal_notes')
      .insert({ lead_id: id, sort_order: personalNotes.length }).select('*').single()
    if (data) setPersonalNotes((cur) => [...cur, data as LeadPersonalNote])
  }
  async function patchPersonalNote(pnId: string, values: Partial<LeadPersonalNote>) {
    setPersonalNotes((cur) => cur.map((p) => (p.id === pnId ? { ...p, ...values } : p)))
    if (supabase) await supabase.from('lead_personal_notes').update(values).eq('id', pnId)
    flashSaved()
  }
  async function removePersonalNote(pnId: string) {
    setPersonalNotes((cur) => cur.filter((p) => p.id !== pnId))
    if (supabase) await supabase.from('lead_personal_notes').delete().eq('id', pnId)
  }

  // ---- referrals ----
  async function addReferral() {
    if (!id || !supabase) return
    const { data } = await supabase.from('lead_referrals')
      .insert({ lead_id: id, name: '', submitted_by: 'agent' }).select('*').single()
    if (data) setReferrals((cur) => [...cur, data as LeadReferral])
  }
  async function patchReferral(rId: string, values: Partial<LeadReferral>) {
    setReferrals((cur) => cur.map((r) => (r.id === rId ? { ...r, ...values } : r)))
    if (supabase) await supabase.from('lead_referrals').update(values).eq('id', rId)
    flashSaved()
  }
  async function removeReferral(rId: string) {
    setReferrals((cur) => cur.filter((r) => r.id !== rId))
    if (supabase) await supabase.from('lead_referrals').delete().eq('id', rId)
  }

  // ---- notes ----
  async function postNote() {
    const body = noteDraft.trim()
    if (!body || !id || !supabase) return
    const { data: auth } = await supabase.auth.getUser()
    const { data: me } = await supabase.from('profiles')
      .select('full_name').eq('id', auth.user?.id).single()
    const { data } = await supabase.from('lead_notes')
      .insert({ lead_id: id, body, author_name: me?.full_name || null })
      .select('*').single()
    if (data) { setNotes((cur) => [data as LeadNote, ...cur]); setNoteDraft('') }
  }

  if (!lead) return <div className="centered"><div className="spinner" /></div>

  return (
    <div className="admin">
      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 15 }}>
          <Link to="/admin/leads" className="muted" style={{ textDecoration: 'none' }}>Active Buyers</Link>
          {' / '}{lead.full_name || 'Unnamed buyer'}
        </span>
        <nav className="adminnav">
          {saveFlash && <span className="muted" style={{ fontSize: 12.5 }}>Saved</span>}
          <Link className="btn" to="/admin/leads">← Active Buyers</Link>
          <button className="btn" onClick={copyLink}>{copied ? 'Copied' : 'Copy client link'}</button>
          <button className="btn primary" onClick={() => convert()} disabled={converting}>
            {converting ? 'Converting…' : 'Convert to transaction'}
          </button>
        </nav>
      </header>
      <AdminNav current="leads" />

      <div style={{ display: 'grid', gap: 18, maxWidth: 1040, margin: '0 auto' }}>
        <div className="card setcard">
          <div className="field2">
            <div className="field">
              <label>Assigned agent</label>
              <select value={lead.realtor_member_id ?? ''}
                      onChange={(e) => patchLead({ realtor_member_id: e.target.value || null })}>
                <option value="">Not assigned yet</option>
                {roster.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Assigned lender</label>
              <select value={lead.lender_member_id ?? ''}
                      onChange={(e) => patchLead({ lender_member_id: e.target.value || null })}>
                <option value="">Not assigned yet</option>
                {roster.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card setcard notesboard">
          <h2>Updates</h2>
          <p className="sethelp">Posted here shows up on their client page — check this first.</p>
          {notes.length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5 }}>No updates posted yet.</p>
          ) : (
            <div className="notelist">
              {notes.map((n) => (
                <div className="note" key={n.id}>
                  <div className="notemeta">
                    {n.author_name && <span className="noteauthor">{n.author_name}</span>}
                    <span className="notewhen">{new Date(n.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}</span>
                  </div>
                  <p className="notebody">{n.body}</p>
                </div>
              ))}
            </div>
          )}
          <div className="noteadd">
            <textarea rows={2} value={noteDraft} placeholder="Post an update…"
                      onChange={(e) => setNoteDraft(e.target.value)} />
            <button type="button" className="btn" onClick={postNote} disabled={!noteDraft.trim()}>Post</button>
          </div>
        </div>

        <div className="leadgrid">
        <div className="leadcol">
        <div className="card setcard">
          <h2>Buyer info</h2>
          <div className="field2">
            <div className="field" style={{
              background: 'var(--panel-2)', border: '1px solid var(--line)',
              borderRadius: 'var(--r-md)', padding: 12,
            }}>
              <label>Client 1</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Thumb src={lead.client_photo_url} />
                <input style={{ flex: 1 }} value={lead.full_name} placeholder="Name"
                       onChange={(e) => patchLead({ full_name: e.target.value })} />
              </div>
              <label className="cl" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <input type="checkbox" checked={lead.primary_contact === '1'}
                       onChange={() => patchLead({ primary_contact: '1' })} />
                Primary contact
              </label>
              <input style={{ marginTop: 8, width: '100%' }} value={lead.phone ?? ''} placeholder="Phone"
                     onChange={(e) => patchLead({ phone: e.target.value })} />
              <input type="email" style={{ marginTop: 8, width: '100%' }} value={lead.email ?? ''} placeholder="Email"
                     onChange={(e) => patchLead({ email: e.target.value })} />
            </div>
            <div className="field" style={{
              background: 'var(--panel-2)', border: '1px solid var(--line)',
              borderRadius: 'var(--r-md)', padding: 12,
            }}>
              <label>Client 2 (optional)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Thumb src={lead.client_photo_url_2} />
                <input style={{ flex: 1 }} value={lead.full_name_2 ?? ''} placeholder="e.g. spouse or co-buyer"
                       onChange={(e) => patchLead({ full_name_2: e.target.value || null })} />
              </div>
              <label className="cl" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <input type="checkbox" checked={lead.primary_contact === '2'}
                       onChange={() => patchLead({ primary_contact: '2' })} />
                Primary contact
              </label>
              <input style={{ marginTop: 8, width: '100%' }} value={lead.phone_2 ?? ''} placeholder="Phone"
                     onChange={(e) => patchLead({ phone_2: e.target.value })} />
              <input type="email" style={{ marginTop: 8, width: '100%' }} value={lead.email_2 ?? ''} placeholder="Email"
                     onChange={(e) => patchLead({ email_2: e.target.value })} />
            </div>
          </div>
          <p className="sethelp" style={{ margin: '8px 0 0' }}>
            Photos are uploaded by the client themselves from their own page.
          </p>
          <div className="field">
            <label>Timeframe to buy</label>
            <div className="tabs">
              {(['0-3', '3-6', '6+'] as const).map((b) => {
                const bandForButton = b === '0-3' ? 'green' : b === '3-6' ? 'yellow' : 'orange'
                const on = lead.timeframe_bucket === b
                const color = TIMEFRAME_BAND_COLOR[bandForButton]
                return (
                  <button key={b} type="button" className="tab"
                          style={on ? { background: `${color}22`, borderColor: color, color } : undefined}
                          onClick={() => patchLead({ timeframe_bucket: b })}>
                    {b === '0-3' ? 'Ready now / 0–3 mo' : b === '3-6' ? '3–6 months' : '6+ months'}
                  </button>
                )
              })}
            </div>
            {lead.timeframe_bucket && (() => {
              const band = leadTimeframeBand(lead)!
              return (
                <p className="sethelp" style={{ margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                    background: TIMEFRAME_BAND_COLOR[band],
                  }} />
                  Currently showing as {TIMEFRAME_BAND_LABEL[band]} on your list — updates on its own as time passes.
                </p>
              )
            })()}
          </div>
          <div className="checkline">
            <input type="checkbox" checked={lead.buyer_broker_signed}
                   onChange={(e) => patchLead({ buyer_broker_signed: e.target.checked })} />
            <span className="cl">Buyer broker agreement signed</span>
          </div>
          <div className="field2" style={{ maxWidth: 460 }}>
            <div className="field">
              <label>Buyer broker signed on</label>
              <input type="date" value={lead.buyer_broker_signed_date ?? ''}
                     onChange={(e) => patchLead({ buyer_broker_signed_date: e.target.value || null })} />
            </div>
            <div className="field">
              <label>Buyer broker expires</label>
              <input type="date" value={lead.buyer_broker_expires ?? ''}
                     onChange={(e) => patchLead({ buyer_broker_expires: e.target.value || null })} />
            </div>
          </div>
        </div>

        <div className="card setcard">
          <h2>Agent transaction info</h2>
          {lead.buyer_broker_expires && (() => {
            const days = daysUntil(lead.buyer_broker_expires)
            const color = days < 0 ? 'var(--danger, #cc3311)' : days <= 14 ? '#d4a017' : 'var(--ink-faint)'
            const text = days < 0
              ? `Buyer broker expired ${Math.abs(days)}d ago`
              : days === 0
              ? 'Buyer broker expires today'
              : `Buyer broker expires in ${days}d`
            return <p className="sethelp" style={{ margin: '0 0 12px', color, fontWeight: 600 }}>{text}</p>
          })()}
          <div className="field" style={{ maxWidth: 260 }}>
            <label>Referral source</label>
            <select value={lead.referral_source ?? ''}
                    onChange={(e) => patchLead({ referral_source: (e.target.value || null) as Lead['referral_source'] })}>
              <option value="">Not set</option>
              {REFERRAL_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <p className="sethelp" style={{ margin: '6px 0 0' }}>Just for you — this never shows to the client.</p>
          </div>

          {lead.referral_source && (
            <div className="field" style={{
              background: 'var(--panel-2)', border: '1px solid var(--line)',
              borderRadius: 'var(--r-md)', padding: '14px 16px', marginTop: 4,
            }}>
              <div className="field2">
                <div className="field">
                  <label>Met eXp Cap</label>
                  <select value={lead.referral_met_exp_cap === null ? '' : lead.referral_met_exp_cap ? 'yes' : 'no'}
                          onChange={(e) => patchLead({
                            referral_met_exp_cap: e.target.value === '' ? null : e.target.value === 'yes',
                          })}>
                    <option value="">Not set</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div className="field">
                  <label>EPIC commission split</label>
                  <input type="text" placeholder="e.g. 80/20"
                         value={lead.referral_epic_split_pct ?? ''}
                         onChange={(e) => patchLead({ referral_epic_split_pct: e.target.value || null })} />
                </div>
              </div>
              <div className="checkline" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={lead.referral_transaction_fee}
                       onChange={(e) => patchLead({
                         referral_transaction_fee: e.target.checked,
                         ...(e.target.checked ? {} : { referral_transaction_fee_amount: null }),
                       })} />
                <span className="cl">Will there be a transaction fee?</span>
              </div>
              {lead.referral_transaction_fee && (
                <div className="field" style={{ maxWidth: 180 }}>
                  <label>Fee amount</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="muted">$</span>
                    <input type="number" step="0.01" min="0" style={{ flex: 1 }}
                           value={lead.referral_transaction_fee_amount ?? ''}
                           onChange={(e) => patchLead({
                             referral_transaction_fee_amount: e.target.value === '' ? null : Number(e.target.value),
                           })} />
                  </div>
                </div>
              )}
              <div className="field" style={{ marginTop: 8 }}>
                <label>Notes</label>
                <textarea rows={2} style={{ width: '100%' }}
                          placeholder="e.g. using 2 agents to sell, other details worth remembering"
                          value={lead.referral_notes ?? ''}
                          onChange={(e) => patchLead({ referral_notes: e.target.value || null })} />
              </div>
            </div>
          )}

          {lead.referral_source === 'Agent Referral' && (
            <div className="field" style={{
              background: 'var(--panel-2)', border: '1px solid var(--line)',
              borderRadius: 'var(--r-md)', padding: '14px 16px', marginTop: 4,
            }}>
              <label>Referring brokerage</label>
              <div className="field2" style={{ marginTop: 8 }}>
                <div className="field">
                  <label>Brokerage name</label>
                  <input value={lead.referral_brokerage_name ?? ''}
                         onChange={(e) => patchLead({ referral_brokerage_name: e.target.value })} />
                </div>
                <div className="field">
                  <label>Brokerage address</label>
                  <input value={lead.referral_brokerage_address ?? ''}
                         onChange={(e) => patchLead({ referral_brokerage_address: e.target.value })} />
                </div>
              </div>
              <div className="field2">
                <div className="field">
                  <label>Contact info</label>
                  <input value={lead.referral_contact_info ?? ''} placeholder="Name, phone, or email"
                         onChange={(e) => patchLead({ referral_contact_info: e.target.value })} />
                </div>
                <div className="field">
                  <label>Commission %</label>
                  <input type="number" step="0.01" min="0" max="100"
                         value={lead.referral_commission_pct ?? ''}
                         onChange={(e) => patchLead({
                           referral_commission_pct: e.target.value === '' ? null : Number(e.target.value),
                         })} />
                </div>
              </div>
              <div className="checkline">
                <input type="checkbox" checked={lead.referral_doc_received}
                       onChange={(e) => patchLead({ referral_doc_received: e.target.checked })} />
                <span className="cl">Referral agreement received</span>
              </div>
            </div>
          )}
        </div>

        <div className="card setcard">
          <h2>Qualification</h2>
          <p className="sethelp">Visible to the client on their page.</p>
          <div className="checkline">
            <input type="checkbox" checked={lead.preapproval_on_file}
                   onChange={(e) => patchLead({ preapproval_on_file: e.target.checked })} />
            <span className="cl">Preapproval on file</span>
          </div>
          <div className="field2">
            <div className="field">
              <label>Budget</label>
              <select value={lead.budget ?? ''}
                      onChange={(e) => patchLead({ budget: (e.target.value || null) as Lead['budget'] })}>
                <option value="">Not set</option>
                {BUDGET_RANGES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Purchase type</label>
              <div className="tabs">
                {(['personal', 'investment'] as const).map((t) => (
                  <button key={t} type="button" className={`tab${lead.purchase_type === t ? ' on' : ''}`}
                          onClick={() => patchLead({ purchase_type: t })}>
                    {t === 'personal' ? 'Personal' : 'Investment'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="field">
            <label>Cash or financing</label>
            <div className="tabs">
              {(['financing', 'cash'] as const).map((t) => (
                <button key={t} type="button" className={`tab${lead.funding_type === t ? ' on' : ''}`}
                        onClick={() => patchLead({ funding_type: t })}>
                  {t === 'financing' ? 'Financing' : 'Cash'}
                </button>
              ))}
            </div>
          </div>
          <div className="checkline">
            <input type="checkbox" checked={lead.has_house_to_sell}
                   onChange={(e) => patchLead({ has_house_to_sell: e.target.checked })} />
            <span className="cl">Has a house to sell first</span>
          </div>
          {lead.has_house_to_sell && (
            <div className="field">
              <label>Why they're selling</label>
              <input value={lead.why_selling ?? ''}
                     onChange={(e) => patchLead({ why_selling: e.target.value })} />
            </div>
          )}
        </div>

        <div className="card setcard">
          <h2>Preferences</h2>
          <p className="sethelp">Areas and general taste — the ranked list below is for specific must-haves.</p>
          <div className="field">
            <label>Communities / areas</label>
            <input value={lead.communities ?? ''} placeholder="e.g. Reunion, Champions Gate"
                   onChange={(e) => patchLead({ communities: e.target.value })} />
          </div>
          <div className="field2">
            <div className="field">
              <label>Likes</label>
              <textarea rows={2} value={lead.likes ?? ''} style={{ width: '100%' }}
                        onChange={(e) => patchLead({ likes: e.target.value })} />
            </div>
            <div className="field">
              <label>Dislikes</label>
              <textarea rows={2} value={lead.dislikes ?? ''} style={{ width: '100%' }}
                        onChange={(e) => patchLead({ dislikes: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="card setcard">
          <h2>Wants &amp; needs</h2>
          <p className="sethelp">In order of importance — top of the list matters most.</p>
          {priorities.map((p, i) => (
            <div className="tmplrow" key={p.id}>
              <span className="muted" style={{ flex: 'none', width: 18 }}>{i + 1}.</span>
              <input type="text" value={p.text} placeholder="e.g. Under $400k, 3 bedrooms, good schools"
                     onChange={(e) => patchPriority(p.id, e.target.value)} />
              <button type="button" className="del" onClick={() => removePriority(p.id)}>✕</button>
            </div>
          ))}
          <div className="savebar"><button className="btn" onClick={addPriority}>+ Add</button></div>
        </div>
        </div>

        <div className="leadcol">
        <div className="card setcard">
          <h2>Appointments</h2>
          <p className="sethelp">Showings and other times you're meeting up.</p>
          {appointments.map((a) => (
            <div key={a.id} style={{
              background: 'var(--panel-2)', border: '1px solid var(--line)',
              borderRadius: 'var(--r-md)', padding: '12px 14px', marginBottom: 10,
            }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <Thumb src={a.photo_url} />
                <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="datetime-local" value={toLocalInput(a.scheduled_at)}
                           onChange={(e) => patchAppointment(a.id, {
                             scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                           })}
                           style={{ flex: 'none', width: 180 }} />
                    <input type="text" value={a.address_line} placeholder="Address" style={{ flex: 1 }}
                           onChange={(e) => patchAppointment(a.id, { address_line: e.target.value })} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" value={a.city_state_zip ?? ''} placeholder="City, state, zip" style={{ flex: 1 }}
                           onChange={(e) => patchAppointment(a.id, { city_state_zip: e.target.value || null })} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" value={a.url ?? ''} placeholder="Listing link" style={{ flex: 1 }}
                           onChange={(e) => patchAppointment(a.id, { url: e.target.value })} />
                    <button type="button" className="btn" style={{ flex: 'none' }}
                            disabled={!a.url || fetchingId === a.id}
                            onClick={async () => {
                              const parsed = parseAddressFromListingUrl(a.url ?? '')
                              const preview = await fetchListingPreview(a.id, a.url ?? '')
                              const values: Partial<LeadAppointment> = {}
                              if (preview?.photo_url) values.photo_url = preview.photo_url
                              if (parsed) {
                                const guess = `${parsed.street}, ${parsed.cityStateZip}`
                                if (confirm(`Use this address?\n\n${guess}`)) {
                                  values.address_line = parsed.street
                                  values.city_state_zip = parsed.cityStateZip
                                }
                              } else if (preview?.title && !a.address_line) {
                                values.address_line = preview.title
                              }
                              if (Object.keys(values).length) patchAppointment(a.id, values)
                              else alert('Couldn’t find a photo or address from that link — enter them below.')
                            }}>
                      {fetchingId === a.id ? 'Fetching…' : 'Fetch photo & address'}
                    </button>
                  </div>
                </div>
                <button type="button" className="del" onClick={() => removeAppointment(a.id)}>✕</button>
              </div>
              <details style={{ marginTop: 8 }}>
                <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
                  Paste a photo URL manually instead
                </summary>
                <input type="text" value={a.photo_url ?? ''} placeholder="Photo URL"
                       style={{ marginTop: 6, width: '100%' }}
                       onChange={(e) => patchAppointment(a.id, { photo_url: e.target.value })} />
              </details>
              <input type="text" value={a.note ?? ''} placeholder="Note" style={{ marginTop: 8, width: '100%' }}
                     onChange={(e) => patchAppointment(a.id, { note: e.target.value })} />
              <div className="checkline" style={{ marginTop: 8, marginBottom: 0 }}>
                <input type="checkbox" checked={a.completed}
                       onChange={(e) => e.target.checked ? completeAppointment(a) : patchAppointment(a.id, { completed: false })} />
                <span className="cl">Showing happened — move it to Homes shown</span>
              </div>
            </div>
          ))}
          <div className="savebar"><button className="btn" onClick={addAppointment}>+ Add appointment</button></div>
        </div>

        <div className="card setcard">
          <h2>Homes you may like</h2>
          <p className="sethelp">Candidates you're still deciding on — visible to the client, same as Homes shown.</p>
          {maybeHomes.map((h) => (
            <div key={h.id} style={{
              background: 'var(--panel-2)', border: '1px solid var(--line)',
              borderRadius: 'var(--r-md)', padding: '12px 14px', marginBottom: 10,
            }}>
              {h.showing_requested && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  background: 'var(--gold-soft, #3a2f1a)', border: '1px solid var(--gold, #C9A44C)',
                  borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: 10, fontSize: 13,
                }}>
                  <span>🔔 Client requested a showing</span>
                  <button type="button" className="btn primary" style={{ flex: 'none' }}
                          onClick={() => scheduleRequestedShowing(h)}>
                    Move to Appointments →
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <Thumb src={h.photo_url} />
                <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                  <input type="text" value={h.address_line} placeholder="Address"
                         onChange={(e) => patchMaybeHome(h.id, { address_line: e.target.value })} />
                  <input type="text" value={h.city_state_zip ?? ''} placeholder="City, state, zip"
                         onChange={(e) => patchMaybeHome(h.id, { city_state_zip: e.target.value || null })} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" value={h.url ?? ''} placeholder="Listing link" style={{ flex: 1 }}
                           onChange={(e) => patchMaybeHome(h.id, { url: e.target.value })} />
                    <button type="button" className="btn" style={{ flex: 'none' }}
                            disabled={!h.url || fetchingId === h.id}
                            onClick={async () => {
                              const parsed = parseAddressFromListingUrl(h.url ?? '')
                              const preview = await fetchListingPreview(h.id, h.url ?? '')
                              const values: Partial<LeadMaybeHome> = {}
                              if (preview?.photo_url) values.photo_url = preview.photo_url
                              if (!h.address_line) {
                                if (parsed) {
                                  const guess = `${parsed.street}, ${parsed.cityStateZip}`
                                  if (confirm(`Use this address?\n\n${guess}`)) {
                                    values.address_line = parsed.street
                                    values.city_state_zip = parsed.cityStateZip
                                  }
                                } else if (preview?.title) {
                                  values.address_line = preview.title
                                }
                              }
                              if (Object.keys(values).length) patchMaybeHome(h.id, values)
                              else alert('Couldn’t find a photo or address from that link — enter them below.')
                            }}>
                      {fetchingId === h.id ? 'Fetching…' : 'Fetch photo & address'}
                    </button>
                  </div>
                </div>
                <button type="button" className="del" onClick={() => removeMaybeHome(h.id)}>✕</button>
              </div>
              <details style={{ marginTop: 8 }}>
                <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
                  Paste a photo URL manually instead
                </summary>
                <input type="text" value={h.photo_url ?? ''} placeholder="Photo URL"
                       style={{ marginTop: 6, width: '100%' }}
                       onChange={(e) => patchMaybeHome(h.id, { photo_url: e.target.value })} />
              </details>
              <div className="field2" style={{ marginTop: 8 }}>
                <div className="field">
                  <label>Notes (client can see)</label>
                  <textarea rows={2} value={h.note ?? ''} style={{ width: '100%' }}
                            onChange={(e) => patchMaybeHome(h.id, { note: e.target.value })} />
                </div>
                <div className="field">
                  <label>Private notes</label>
                  <textarea rows={2} value={h.private_note ?? ''} style={{ width: '100%' }}
                            onChange={(e) => patchMaybeHome(h.id, { private_note: e.target.value })} />
                </div>
              </div>
              <div className="savebar" style={{ padding: '8px 0 0' }}>
                <button type="button" className="btn" onClick={() => moveMaybeHomeToAppointment(h)}>
                  Move to appointments →
                </button>
                <button type="button" className="btn" onClick={() => promoteMaybeHome(h)}>
                  Mark as shown →
                </button>
              </div>
            </div>
          ))}
          <div className="savebar"><button className="btn" onClick={addMaybeHome}>+ Add home</button></div>
        </div>

        <div className="card setcard">
          <h2>Homes shown</h2>
          <p className="sethelp">The handful of properties you've actually toured together — visible to the client.</p>
          {homes.map((h) => (
            <div key={h.id} style={{
              background: 'var(--panel-2)', border: '1px solid var(--line)',
              borderRadius: 'var(--r-md)', padding: '12px 14px', marginBottom: 10,
            }}>
              {h.offer_requested && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  background: 'var(--gold-soft, #3a2f1a)', border: '1px solid var(--gold, #C9A44C)',
                  borderRadius: 'var(--r-sm)', padding: '8px 10px', marginBottom: 10, fontSize: 13,
                }}>
                  <span>🎉 Client wants to make an offer on this one!</span>
                  <button type="button" className="btn" style={{ flex: 'none' }}
                          onClick={() => patchHome(h.id, { offer_requested: false })}>
                    Got it
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <Thumb src={h.photo_url} />
                <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" value={h.address_line} placeholder="Address" style={{ flex: 1 }}
                           onChange={(e) => patchHome(h.id, { address_line: e.target.value })} />
                    <input type="date" value={h.shown_at ?? ''} style={{ flex: 'none', width: 155 }}
                           onChange={(e) => patchHome(h.id, { shown_at: e.target.value || null })} />
                    <input type="text" value={h.price ?? ''} placeholder="Price"
                           style={{ flex: 'none', width: 100 }}
                           onChange={(e) => patchHome(h.id, { price: e.target.value })} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" value={h.city_state_zip ?? ''} placeholder="City, state, zip" style={{ flex: 1 }}
                           onChange={(e) => patchHome(h.id, { city_state_zip: e.target.value || null })} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" value={h.url ?? ''} placeholder="Listing link" style={{ flex: 1 }}
                           onChange={(e) => patchHome(h.id, { url: e.target.value })} />
                    <button type="button" className="btn" style={{ flex: 'none' }}
                            disabled={!h.url || fetchingId === h.id}
                            onClick={async () => {
                              const parsed = parseAddressFromListingUrl(h.url ?? '')
                              const preview = await fetchListingPreview(h.id, h.url ?? '')
                              const values: Partial<LeadHome> = {}
                              if (preview?.photo_url) values.photo_url = preview.photo_url
                              if (parsed) {
                                const guess = `${parsed.street}, ${parsed.cityStateZip}`
                                if (confirm(`Use this address?\n\n${guess}`)) {
                                  values.address_line = parsed.street
                                  values.city_state_zip = parsed.cityStateZip
                                }
                              } else if (preview?.title && !h.address_line) {
                                values.address_line = preview.title
                              }
                              if (Object.keys(values).length) patchHome(h.id, values)
                              else alert('Couldn’t find a photo or address from that link — enter them below.')
                            }}>
                      {fetchingId === h.id ? 'Fetching…' : 'Fetch photo & address'}
                    </button>
                  </div>
                </div>
                <button type="button" className="del" onClick={() => removeHome(h.id)}>✕</button>
              </div>
              <details style={{ marginTop: 8 }}>
                <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
                  Paste a photo URL manually instead
                </summary>
                <input type="text" value={h.photo_url ?? ''} placeholder="Photo URL"
                       style={{ marginTop: 6, width: '100%' }}
                       onChange={(e) => patchHome(h.id, { photo_url: e.target.value })} />
              </details>
              <div className="savebar" style={{ padding: '8px 0 0' }}>
                <button type="button" className="btn primary" disabled={converting}
                        onClick={() => convert(h.id)}>
                  Went under contract →
                </button>
              </div>
              <div className="field2" style={{ marginTop: 8 }}>
                <div className="field">
                  <label>Notes (client can see)</label>
                  <textarea rows={2} value={h.note ?? ''} style={{ width: '100%' }}
                            onChange={(e) => patchHome(h.id, { note: e.target.value })} />
                </div>
                <div className="field">
                  <label>Private notes</label>
                  <textarea rows={2} value={h.private_note ?? ''} style={{ width: '100%' }}
                            onChange={(e) => patchHome(h.id, { private_note: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
          <div className="savebar"><button className="btn" onClick={addHome}>+ Add home</button></div>
        </div>
        </div>
        </div>

        <div className="card setcard">
          <h2>Personal details</h2>
          <p className="sethelp">Kids, pets, birthdays, anniversaries, anything worth remembering. Just for you.</p>
          {personalNotes.map((p) => (
            <div className="tmplrow" key={p.id}>
              <input type="text" value={p.text} placeholder="e.g. Emma's birthday, Anniversary, Dog's name"
                     onChange={(e) => patchPersonalNote(p.id, { text: e.target.value })} />
              <input type="date" value={p.date_value ?? ''} style={{ flex: 'none', width: 155 }}
                     onChange={(e) => patchPersonalNote(p.id, { date_value: e.target.value || null })} />
              <button type="button" className="del" onClick={() => removePersonalNote(p.id)}>✕</button>
            </div>
          ))}
          <div className="savebar"><button className="btn" onClick={addPersonalNote}>+ Add</button></div>
        </div>

        <div className="card setcard">
          <h2>Referrals from friends &amp; family</h2>
          <p className="sethelp">
            Anyone they've mentioned who might also buy or sell. The client can add these
            themselves from their own page too — those show up here tagged "From client."
          </p>
          {referrals.map((r) => (
            <div className="tmplrow" key={r.id}>
              <input type="text" value={r.name} placeholder="Name"
                     onChange={(e) => patchReferral(r.id, { name: e.target.value })} />
              <input type="text" value={r.phone ?? ''} placeholder="Phone"
                     onChange={(e) => patchReferral(r.id, { phone: e.target.value })} />
              <input type="email" value={r.email ?? ''} placeholder="Email"
                     onChange={(e) => patchReferral(r.id, { email: e.target.value })} />
              {r.submitted_by === 'client' && (
                <span className="tag" style={{ flex: 'none' }}>From client</span>
              )}
              <button type="button" className="del" onClick={() => removeReferral(r.id)}>✕</button>
            </div>
          ))}
          <div className="savebar"><button className="btn" onClick={addReferral}>+ Add</button></div>
        </div>

        <div className="card setcard">
          <h2>General notes</h2>
          <p className="sethelp">Just for you — this never shows to the client.</p>
          <textarea rows={4} value={lead.general_notes ?? ''}
                    onChange={(e) => patchLead({ general_notes: e.target.value })}
                    style={{ width: '100%' }} />
        </div>
      </div>
    </div>
  )
}
