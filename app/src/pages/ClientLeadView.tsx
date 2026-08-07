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
        <span className="viewnote">Home Search · {lead.full_name}</span>
      </div>

      <div className="topgrid" style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 720, margin: '0 auto' }}>
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

        {appointments.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <h3 className="eyebrow">Upcoming appointments</h3>
            <div className="notelist">
              {appointments.map((a) => (
                <div className="note" key={a.id}>
                  <div className="notemeta"><span className="noteauthor">{fmtWhen(a.scheduled_at)}</span></div>
                  <p className="notebody">
                    {a.address_line}
                    {a.note ? ` — ${a.note}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {maybeHomes.length > 0 && (
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
                  </p>
                  {h.note && <p className="notebody muted" style={{ fontSize: 12.5 }}>{h.note}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {homes.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <h3 className="eyebrow">Homes we're looking at</h3>
            <div className="notelist">
              {homes.map((h) => (
                <div className="note" key={h.id}>
                  {h.photo_url && (
                    <img src={h.photo_url} alt="" style={{
                      width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginBottom: 8,
                    }} />
                  )}
                  <p className="notebody">
                    {h.url ? <a href={h.url} target="_blank" rel="noreferrer">{h.address_line}</a> : h.address_line}
                    {h.city_state_zip ? `, ${h.city_state_zip}` : ''}
                    {h.price ? ` — ${h.price}` : ''}
                  </p>
                  {h.note && <p className="notebody muted" style={{ fontSize: 12.5 }}>{h.note}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {priorities.length > 0 && (
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
