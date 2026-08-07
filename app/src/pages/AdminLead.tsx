import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { Lead, LeadAppointment, LeadHome, LeadPriority, LeadNote, TeamMember } from '../lib/types'
import { leadTimeframeBand, TIMEFRAME_BAND_COLOR, TIMEFRAME_BAND_LABEL } from '../lib/types'
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
  const [priorities, setPriorities] = useState<LeadPriority[]>([])
  const [notes, setNotes] = useState<LeadNote[]>([])
  const [copied, setCopied] = useState(false)
  const [converting, setConverting] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

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
    supabase.from('lead_priorities').select('*').eq('lead_id', id).order('sort_order')
      .then(({ data }) => setPriorities((data as LeadPriority[]) ?? []))
    supabase.from('lead_notes').select('*').eq('lead_id', id).order('created_at', { ascending: false })
      .then(({ data }) => setNotes((data as LeadNote[]) ?? []))
  }, [id])

  async function patchLead(values: Partial<Lead>) {
    setLead((cur) => (cur ? { ...cur, ...values } : cur))
    if (DEMO_MODE || !supabase || !id) return
    await supabase.from('leads').update(values).eq('id', id)
  }

  function copyLink() {
    if (!lead) return
    navigator.clipboard.writeText(`${window.location.origin}/l/${lead.share_token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  async function convert() {
    if (!id || !supabase || converting) return
    if (!confirm('Convert this buyer to a full transaction? Use this once they’re under contract.')) return
    setConverting(true)
    const { data: txId, error } = await supabase.rpc('convert_lead_to_transaction', { p_lead_id: id })
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
  }
  async function removeAppointment(aptId: string) {
    setAppointments((cur) => cur.filter((a) => a.id !== aptId))
    if (supabase) await supabase.from('lead_appointments').delete().eq('id', aptId)
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
  }
  async function removeHome(homeId: string) {
    setHomes((cur) => cur.filter((h) => h.id !== homeId))
    if (supabase) await supabase.from('lead_homes').delete().eq('id', homeId)
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
  }
  async function removePriority(pId: string) {
    setPriorities((cur) => cur.filter((p) => p.id !== pId))
    if (supabase) await supabase.from('lead_priorities').delete().eq('id', pId)
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
          <button className="btn" onClick={copyLink}>{copied ? 'Copied' : 'Copy client link'}</button>
          <button className="btn primary" onClick={convert} disabled={converting}>
            {converting ? 'Converting…' : 'Convert to transaction'}
          </button>
        </nav>
      </header>

      <div className="settings">
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
        </div>

        <div className="card setcard">
          <h2>Appointments</h2>
          <p className="sethelp">Showings and other times you're meeting up.</p>
          {appointments.map((a) => (
            <div className="tmplrow" key={a.id}>
              <input type="datetime-local" value={toLocalInput(a.scheduled_at)}
                     onChange={(e) => patchAppointment(a.id, {
                       scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                     })}
                     style={{ flex: 'none', width: 190 }} />
              <input type="text" value={a.address_line} placeholder="Address"
                     onChange={(e) => patchAppointment(a.id, { address_line: e.target.value })} />
              <input type="text" value={a.note ?? ''} placeholder="Note"
                     onChange={(e) => patchAppointment(a.id, { note: e.target.value })} />
              <button type="button" className="del" onClick={() => removeAppointment(a.id)}>✕</button>
            </div>
          ))}
          <div className="savebar"><button className="btn" onClick={addAppointment}>+ Add appointment</button></div>
        </div>

        <div className="card setcard">
          <h2>Homes shown</h2>
          <p className="sethelp">The handful of properties you've got in front of them.</p>
          {homes.map((h) => (
            <div className="tmplrow" key={h.id}>
              <input type="text" value={h.address_line} placeholder="Address"
                     onChange={(e) => patchHome(h.id, { address_line: e.target.value })} />
              <input type="text" value={h.price ?? ''} placeholder="Price" style={{ flex: 'none', width: 110 }}
                     onChange={(e) => patchHome(h.id, { price: e.target.value })} />
              <input type="text" value={h.url ?? ''} placeholder="Listing link"
                     onChange={(e) => patchHome(h.id, { url: e.target.value })} />
              <button type="button" className="del" onClick={() => removeHome(h.id)}>✕</button>
            </div>
          ))}
          <div className="savebar"><button className="btn" onClick={addHome}>+ Add home</button></div>
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

        <div className="card setcard">
          <h2>General notes</h2>
          <p className="sethelp">Just for you — this never shows to the client.</p>
          <textarea rows={4} value={lead.general_notes ?? ''}
                    onChange={(e) => patchLead({ general_notes: e.target.value })}
                    style={{ width: '100%' }} />
        </div>

        <div className="card setcard">
          <h2>Updates</h2>
          <p className="sethelp">Posted here shows up on their client page.</p>
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
      </div>
    </div>
  )
}
