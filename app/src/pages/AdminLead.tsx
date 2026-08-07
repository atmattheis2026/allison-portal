import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { Lead, LeadAppointment, LeadHome, LeadMaybeHome, LeadPriority, LeadPersonalNote, LeadReferral, LeadNote, TeamMember } from '../lib/types'
import { leadTimeframeBand, TIMEFRAME_BAND_COLOR, TIMEFRAME_BAND_LABEL, REFERRAL_SOURCES, BUDGET_RANGES } from '../lib/types'
import './Admin.css'

/** datetime-local wants "YYYY-MM-DDTHH:mm" in local time, not an ISO string. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

  // Fires when a listing URL field loses focus and there's no photo yet.
  // Best-effort — plenty of sites block this, and that's fine, it just means
  // the photo and address fields stay empty for manual entry like before
  // this existed. `title` stands in for a typed address on Appointments,
  // where the link is meant to replace typing one at all.
  async function tryAutoPreview(url: string, onFound: (v: { photo_url?: string; title?: string }) => void) {
    if (!supabase || !url.trim()) return
    const { data } = await supabase.functions.invoke('fetch-link-preview', { body: { url } })
    if (data?.photo_url || data?.title) {
      onFound({ photo_url: data.photo_url ?? undefined, title: data.title ?? undefined })
    }
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
        lead_id: id, address_line: apt.address_line, url: apt.url,
        photo_url: apt.photo_url, note: apt.note, sort_order: homes.length,
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
    const { data } = await supabase.from('lead_homes')
      .insert({
        lead_id: id, address_line: h.address_line, url: h.url,
        photo_url: h.photo_url, note: h.note, private_note: h.private_note, sort_order: homes.length,
      })
      .select('*').single()
    if (data) setHomes((cur) => [...cur, data as LeadHome])
    setMaybeHomes((cur) => cur.filter((x) => x.id !== h.id))
    await supabase.from('lead_maybe_homes').delete().eq('id', h.id)
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

      <div style={{ display: 'grid', gap: 18, maxWidth: 1040, margin: '0 auto' }}>
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
            <div className="field">
              <label>Name</label>
              <input value={lead.full_name} onChange={(e) => patchLead({ full_name: e.target.value })} />
            </div>
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
          </div>
          <div className="field2">
            <div className="field">
              <label>Phone</label>
              <input value={lead.phone ?? ''} onChange={(e) => patchLead({ phone: e.target.value })} />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={lead.email ?? ''} onChange={(e) => patchLead({ email: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Timeframe to buy</label>
            <div className="tabs">
              {(['0-3', '3-6', '6+'] as const).map((b) => (
                <button key={b} type="button" className={`tab${lead.timeframe_bucket === b ? ' on' : ''}`}
                        onClick={() => patchLead({ timeframe_bucket: b })}>
                  {b === '0-3' ? 'Ready now / 0–3 mo' : b === '3-6' ? '3–6 months' : '6+ months'}
                </button>
              ))}
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
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Buyer broker expires</label>
            <input type="date" value={lead.buyer_broker_expires ?? ''}
                   onChange={(e) => patchLead({ buyer_broker_expires: e.target.value || null })} />
          </div>
          <div className="field" style={{ maxWidth: 260 }}>
            <label>Referral source</label>
            <select value={lead.referral_source ?? ''}
                    onChange={(e) => patchLead({ referral_source: (e.target.value || null) as Lead['referral_source'] })}>
              <option value="">Not set</option>
              {REFERRAL_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <p className="sethelp" style={{ margin: '6px 0 0' }}>Just for you — this never shows to the client.</p>
          </div>

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
          <p className="sethelp">Just for you — none of this shows to the client.</p>
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
              <div className="tmplrow" style={{ padding: 0 }}>
                <input type="datetime-local" value={toLocalInput(a.scheduled_at)}
                       onChange={(e) => patchAppointment(a.id, {
                         scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                       })}
                       style={{ flex: 'none', width: 190 }} />
                <button type="button" className="del" onClick={() => removeAppointment(a.id)}>✕</button>
              </div>
              <input type="text" value={a.url ?? ''} placeholder="Listing link (fills in the address below)"
                     style={{ marginTop: 6, width: '100%' }}
                     onChange={(e) => patchAppointment(a.id, { url: e.target.value })}
                     onBlur={(e) => {
                       if (e.target.value) {
                         tryAutoPreview(e.target.value, ({ photo_url, title }) => {
                           const values: Partial<LeadAppointment> = {}
                           if (photo_url && !a.photo_url) values.photo_url = photo_url
                           if (title && !a.address_line) values.address_line = title
                           if (Object.keys(values).length) patchAppointment(a.id, values)
                         })
                       }
                     }} />
              <input type="text" value={a.address_line} placeholder="Address (fills in automatically from the link)"
                     style={{ marginTop: 6, width: '100%' }}
                     onChange={(e) => patchAppointment(a.id, { address_line: e.target.value })} />
              {a.photo_url && (
                <img src={a.photo_url} alt="" style={{
                  width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 6, marginTop: 6,
                }} />
              )}
              <input type="text" value={a.note ?? ''} placeholder="Note" style={{ marginTop: 6, width: '100%' }}
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
              <div className="tmplrow" style={{ padding: 0, gap: 8 }}>
                <input type="text" value={h.address_line} placeholder="Address"
                       style={{
                         background: 'var(--panel-2)', border: '1px solid var(--line)',
                         borderRadius: 'var(--r-sm)', padding: '9px 11px',
                       }}
                       onChange={(e) => patchMaybeHome(h.id, { address_line: e.target.value })} />
                <input type="text" value={h.url ?? ''} placeholder="Listing link"
                       style={{
                         background: 'var(--panel-2)', border: '1px solid var(--line)',
                         borderRadius: 'var(--r-sm)', padding: '9px 11px',
                       }}
                       onChange={(e) => patchMaybeHome(h.id, { url: e.target.value })}
                       onBlur={(e) => {
                         if (e.target.value && (!h.photo_url || !h.address_line)) {
                           tryAutoPreview(e.target.value, ({ photo_url, title }) => {
                             const values: Partial<LeadMaybeHome> = {}
                             if (photo_url && !h.photo_url) values.photo_url = photo_url
                             if (title && !h.address_line) values.address_line = title
                             if (Object.keys(values).length) patchMaybeHome(h.id, values)
                           })
                         }
                       }} />
                <button type="button" className="btn" style={{ flex: 'none' }}
                        onClick={() => promoteMaybeHome(h)}>
                  Mark as shown →
                </button>
                <button type="button" className="del" onClick={() => removeMaybeHome(h.id)}>✕</button>
              </div>
              <input type="text" value={h.photo_url ?? ''} placeholder="Photo URL (paste from the listing)"
                     style={{ marginTop: 6, width: '100%' }}
                     onChange={(e) => patchMaybeHome(h.id, { photo_url: e.target.value })} />
              {h.photo_url && (
                <img src={h.photo_url} alt="" style={{
                  width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 6, marginTop: 6,
                }} />
              )}
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
              <div className="tmplrow" style={{ padding: 0, gap: 8 }}>
                <input type="text" value={h.address_line} placeholder="Address"
                       style={{
                         background: 'var(--panel-2)', border: '1px solid var(--line)',
                         borderRadius: 'var(--r-sm)', padding: '9px 11px',
                       }}
                       onChange={(e) => patchHome(h.id, { address_line: e.target.value })} />
                <input type="text" value={h.price ?? ''} placeholder="Price"
                       style={{
                         flex: 'none', width: 110, background: 'var(--panel-2)',
                         border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '9px 11px',
                       }}
                       onChange={(e) => patchHome(h.id, { price: e.target.value })} />
                <input type="text" value={h.url ?? ''} placeholder="Listing link"
                       style={{
                         background: 'var(--panel-2)', border: '1px solid var(--line)',
                         borderRadius: 'var(--r-sm)', padding: '9px 11px',
                       }}
                       onChange={(e) => patchHome(h.id, { url: e.target.value })}
                       onBlur={(e) => {
                         if (e.target.value && (!h.photo_url || !h.address_line)) {
                           tryAutoPreview(e.target.value, ({ photo_url, title }) => {
                             const values: Partial<LeadHome> = {}
                             if (photo_url && !h.photo_url) values.photo_url = photo_url
                             if (title && !h.address_line) values.address_line = title
                             if (Object.keys(values).length) patchHome(h.id, values)
                           })
                         }
                       }} />
                <button type="button" className="del" onClick={() => removeHome(h.id)}>✕</button>
              </div>
              <div className="savebar" style={{ padding: '8px 0 0' }}>
                <button type="button" className="btn primary" disabled={converting}
                        onClick={() => convert(h.id)}>
                  Went under contract →
                </button>
              </div>
              <input type="text" value={h.photo_url ?? ''} placeholder="Photo URL (paste from the listing)"
                     style={{ marginTop: 6, width: '100%' }}
                     onChange={(e) => patchHome(h.id, { photo_url: e.target.value })} />
              {h.photo_url && (
                <img src={h.photo_url} alt="" style={{
                  width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 6, marginTop: 6,
                }} />
              )}
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
