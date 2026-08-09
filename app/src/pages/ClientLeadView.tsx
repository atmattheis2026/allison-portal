import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { SharedLeadPayload } from '../lib/types'
import '../components/Dashboard.css'

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) return <img className="avatar" src={src} alt={name} />
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase()).join('')
  return <div className="avatar placeholder">{initials || '?'}</div>
}

function fmtWhen(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

/** shown_at is a plain "YYYY-MM-DD" with no time — parsing it as-is would
 *  read as UTC midnight and can print as the day before in US timezones. */
function fmtDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

/** Downscales in the browser before it ever leaves the device — a phone
 *  photo straight off the camera is easily 5-10MB, and none of that detail
 *  matters for a small avatar. Keeps the upload fast and well under any
 *  request-size limit on the function that receives it. */
async function resizeImageToBase64(file: File, maxDim = 480, quality = 0.85): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = URL.createObjectURL(file)
  })
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality).split(',')[1]
}

function ClientPhotoUpload({ token, slot, name, initialUrl }: {
  token: string; slot: 1 | 2; name: string; initialUrl: string | null
}) {
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File) {
    if (!supabase) return
    setBusy(true)
    const base64 = await resizeImageToBase64(file)
    const { data, error } = await supabase.functions.invoke('upload-client-photo', {
      body: { token, slot, file_base64: base64, content_type: 'image/jpeg' },
    })
    setBusy(false)
    if (!error && data?.url) setUrl(data.url)
  }

  return (
    <div className="person">
      <label style={{ cursor: 'pointer' }}>
        <input type="file" accept="image/*" style={{ display: 'none' }}
               onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        <Avatar src={url} name={name} />
      </label>
      <div className="who">
        <div className="name">{name}</div>
        <label style={{ cursor: 'pointer' }}>
          <input type="file" accept="image/*" style={{ display: 'none' }}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          <span className="muted" style={{ fontSize: 12, textDecoration: 'underline' }}>
            {busy ? 'Uploading…' : url ? 'Change photo' : 'Add your photo'}
          </span>
        </label>
      </div>
    </div>
  )
}

/**
 * The read-only page Allison (or her agents) text to an active buyer:
 * /l/<share token>. Sibling to ClientView.tsx, but for someone who hasn't
 * found (or gone under contract on) a home yet — no checklist, no closing
 * date, just what's coming up and what they're looking for.
 */
export default function ClientLeadView() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<SharedLeadPayload | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (DEMO_MODE || !supabase) { setState('notfound'); return }
      const { data: payload, error } = await supabase.rpc('get_shared_lead', { p_token: token })
      if (cancelled) return
      if (error) { console.error(error); setState('error') }
      else if (!payload) setState('notfound')
      else { setData(payload as SharedLeadPayload); setState('ok') }
    }

    load()
    return () => { cancelled = true }
  }, [token])

  if (state === 'loading') {
    return <div className="centered"><div className="spinner" /></div>
  }

  if (state === 'notfound') {
    return (
      <div className="centered">
        <div>
          <div className="wordmark" style={{ fontSize: 15, marginBottom: 14 }}>Not found</div>
          <p className="muted" style={{ maxWidth: 340, lineHeight: 1.7 }}>
            This link isn’t active anymore. Reach out to your agent for an updated one.
          </p>
        </div>
      </div>
    )
  }

  if (state === 'error' || !data) {
    return (
      <div className="centered">
        <div>
          <div className="wordmark" style={{ fontSize: 15, marginBottom: 14 }}>Something went wrong</div>
          <p className="muted" style={{ maxWidth: 340, lineHeight: 1.7 }}>
            We couldn’t load this page. Try refreshing.
          </p>
        </div>
      </div>
    )
  }

  const { lead, realtor, brand, appointments, homes, maybe_homes: maybeHomes, priorities, notes } = data
  const light = brand?.needs_light_background
  const logo = light ? brand?.logo_light_url || brand?.logo_url : brand?.logo_url
  const styleVars = brand?.accent_hex ? ({ '--gold': brand.accent_hex } as React.CSSProperties) : {}

  return (
    <div className="dash" style={styleVars}>
      <div className={`brandbar${light ? ' lightband' : ''}`}>
        {logo
          ? <img src={logo} alt={brand?.name || ''} />
          : <span className="wordmark">{brand?.wordmark_text || brand?.name || 'Your Company'}</span>}
        <span className="viewnote">
          {lead.wants_buying && lead.wants_loan ? 'Home Search & Loan' : lead.wants_loan ? 'Loan Update' : 'Home Search'}
          {' · '}{lead.full_name}
        </span>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16, padding: 16, maxWidth: 900, margin: '0 auto', alignItems: 'start',
      }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="team">
            <ClientPhotoUpload token={token ?? ''} slot={1} name={lead.full_name} initialUrl={lead.client_photo_url} />
            {lead.full_name_2 && (
              <ClientPhotoUpload token={token ?? ''} slot={2} name={lead.full_name_2} initialUrl={lead.client_photo_url_2} />
            )}
          </div>
        </div>

        {realtor && (
          <div className="card" style={{ padding: 16 }}>
            <div className="team">
              <div className="person">
                <Avatar src={realtor.headshot_url} name={realtor.full_name} />
                <div className="who">
                  <div className="role">Your agent</div>
                  <div className="name">{realtor.full_name}</div>
                  {realtor.phone && <div className="lic">{realtor.phone}</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {lead.wants_loan && (lead.loan_type || lead.loan_status) && (
          <div className="card" style={{ padding: 16 }}>
            <h3 className="eyebrow">Loan Status</h3>
            <div className="notelist">
              {lead.loan_type && (
                <p className="notebody">
                  Loan type: {lead.loan_type === 'Other' && lead.loan_type_other ? lead.loan_type_other : lead.loan_type}
                </p>
              )}
              {lead.loan_status && <p className="notebody">Status: {lead.loan_status}</p>}
            </div>
          </div>
        )}

        {lead.wants_buying && (lead.preapproval_on_file || lead.budget || lead.purchase_type || lead.funding_type || lead.has_house_to_sell) && (
          <div className="card" style={{ padding: 16 }}>
            <h3 className="eyebrow">Qualification</h3>
            <div className="notelist">
              {lead.preapproval_on_file && <p className="notebody">✓ Preapproval on file</p>}
              {lead.budget && <p className="notebody">Budget: {lead.budget}</p>}
              {lead.purchase_type && (
                <p className="notebody">{lead.purchase_type === 'investment' ? 'Investment purchase' : 'Personal purchase'}</p>
              )}
              {lead.funding_type && (
                <p className="notebody">{lead.funding_type === 'cash' ? 'Paying cash' : 'Financing'}</p>
              )}
              {lead.has_house_to_sell && (
                <p className="notebody">
                  Has a house to sell first{lead.why_selling ? ` — ${lead.why_selling}` : ''}
                </p>
              )}
            </div>
          </div>
        )}

        {lead.wants_buying && appointments.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <h3 className="eyebrow">Appointments</h3>
            <div className="notelist">
              {appointments.map((a) => (
                <div className="note" key={a.id} style={{ display: 'flex', gap: 12 }}>
                  {a.photo_url && (
                    <img src={a.photo_url} alt="" style={{
                      width: 88, height: 88, objectFit: 'cover', borderRadius: 8, flex: 'none',
                    }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="notemeta"><span className="noteauthor">{fmtWhen(a.scheduled_at)}</span></div>
                    <p className="notebody">
                      {a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.address_line}</a> : a.address_line}
                      {a.city_state_zip ? `, ${a.city_state_zip}` : ''}
                      {a.note ? ` — ${a.note}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {lead.wants_buying && maybeHomes.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <h3 className="eyebrow">Homes you may like</h3>
            <div className="notelist">
              {maybeHomes.map((h) => (
                <div className="note" key={h.id}>
                  {h.photo_url && (
                    <img src={h.photo_url} alt="" style={{
                      width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginBottom: 8,
                    }} />
                  )}
                  <p className="notebody">
                    {h.url ? <a href={h.url} target="_blank" rel="noreferrer">{h.address_line}</a> : h.address_line}
                    {h.city_state_zip ? `, ${h.city_state_zip}` : ''}
                  </p>
                  {h.note && <p className="notebody muted" style={{ fontSize: 12.5 }}>{h.note}</p>}
                  <RequestShowingButton token={token ?? ''} homeId={h.id} initiallyRequested={h.showing_requested} />
                </div>
              ))}
            </div>
          </div>
        )}

        {lead.wants_buying && homes.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <h3 className="eyebrow">Homes shown</h3>
            <div className="notelist">
              {homes.map((h) => (
                <div className="note" key={h.id}>
                  {h.photo_url && (
                    <img src={h.photo_url} alt="" style={{
                      width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginBottom: 8,
                    }} />
                  )}
                  {h.shown_at && <div className="notemeta"><span className="noteauthor">Shown {fmtDate(h.shown_at)}</span></div>}
                  <p className="notebody">
                    {h.url ? <a href={h.url} target="_blank" rel="noreferrer">{h.address_line}</a> : h.address_line}
                    {h.city_state_zip ? `, ${h.city_state_zip}` : ''}
                    {h.price ? ` — ${h.price}` : ''}
                  </p>
                  {h.note && <p className="notebody muted" style={{ fontSize: 12.5 }}>{h.note}</p>}
                  <MakeOfferButton token={token ?? ''} homeId={h.id} initiallyRequested={h.offer_requested} />
                </div>
              ))}
            </div>
          </div>
        )}

        {lead.wants_buying && priorities.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <h3 className="eyebrow">What you're looking for</h3>
            <ol style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.8 }}>
              {priorities.map((p) => <li key={p.id}>{p.text}</li>)}
            </ol>
          </div>
        )}

        <div className="card notesboard">
          <h3 className="eyebrow">Updates</h3>
          {notes.length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>No updates posted yet.</p>
          ) : (
            <div className="notelist">
              {notes.map((n) => (
                <div className="note" key={n.id}>
                  <div className="notemeta">
                    {n.author_name && <span className="noteauthor">{n.author_name}</span>}
                    <span className="notewhen">{fmtWhen(n.created_at)}</span>
                  </div>
                  <p className="notebody">{n.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <ReferralForm token={token ?? ''} />
      </div>
    </div>
  )
}

function RequestShowingButton({ token, homeId, initiallyRequested }: {
  token: string; homeId: string; initiallyRequested: boolean
}) {
  const [requested, setRequested] = useState(initiallyRequested)
  const [busy, setBusy] = useState(false)

  if (requested) {
    return <p className="notebody muted" style={{ fontSize: 12.5, marginTop: 6 }}>Showing requested — we'll be in touch.</p>
  }

  return (
    <button
      type="button" className="btn" style={{ marginTop: 8 }} disabled={busy || !supabase}
      onClick={async () => {
        if (!supabase) return
        setBusy(true)
        const { error } = await supabase.functions.invoke('request-showing', {
          body: { token, home_id: homeId },
        })
        setBusy(false)
        if (!error) setRequested(true)
      }}
    >
      {busy ? 'Sending…' : 'Request a showing'}
    </button>
  )
}

function MakeOfferButton({ token, homeId, initiallyRequested }: {
  token: string; homeId: string; initiallyRequested: boolean
}) {
  const [requested, setRequested] = useState(initiallyRequested)
  const [busy, setBusy] = useState(false)

  if (requested) {
    return <p className="notebody muted" style={{ fontSize: 12.5, marginTop: 6 }}>We got it — your agent will be in touch!</p>
  }

  return (
    <button
      type="button" className="btn primary" style={{ marginTop: 8 }} disabled={busy || !supabase}
      onClick={async () => {
        if (!supabase) return
        setBusy(true)
        const { error } = await supabase.functions.invoke('request-offer', {
          body: { token, home_id: homeId },
        })
        setBusy(false)
        if (!error) setRequested(true)
      }}
    >
      {busy ? 'Sending…' : "LET'S MAKE AN OFFER!"}
    </button>
  )
}

function ReferralForm({ token }: { token: string }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('add_lead_referral', {
      p_token: token, p_name: name, p_phone: phone || null, p_email: email || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setSent(true)
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 className="eyebrow">Know someone looking to buy or sell?</h3>
      {sent ? (
        <p className="notebody" style={{ marginTop: 8 }}>Thanks — we'll be in touch with them.</p>
      ) : (
        <form onSubmit={submit} style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          <input value={name} required placeholder="Their name" onChange={(e) => setName(e.target.value)} />
          <input value={phone} placeholder="Phone (optional)" onChange={(e) => setPhone(e.target.value)} />
          <input type="email" value={email} placeholder="Email (optional)" onChange={(e) => setEmail(e.target.value)} />
          {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
          <button className="btn primary" disabled={busy || !name.trim()} style={{ justifySelf: 'start' }}>
            {busy ? 'Sending…' : 'Send referral'}
          </button>
        </form>
      )}
    </div>
  )
}
