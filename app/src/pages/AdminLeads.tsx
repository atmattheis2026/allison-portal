import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { Lead, TeamMember } from '../lib/types'
import { leadTimeframeBand, TIMEFRAME_BAND_COLOR, TIMEFRAME_BAND_LABEL } from '../lib/types'
import './Admin.css'

/**
 * "Active Buyers" — clients still house hunting, before there's a contract.
 * Lighter cousin of AdminList: no address, no status rail, just who they are
 * and who's working with them. RLS already limits `rows` to leads this signed-
 * in person can see (their own, or all of them if they see every transaction),
 * so there's no client-side filtering to do here.
 */
export default function AdminLeads() {
  const [rows, setRows] = useState<Lead[] | null>(null)
  const [roster, setRoster] = useState<TeamMember[]>([])
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const nav = useNavigate()

  useEffect(() => {
    if (DEMO_MODE || !supabase) { setRows([]); return }

    async function load() {
      const { data: auth } = await supabase!.auth.getUser()
      if (!auth.user) { nav('/login'); return }

      const { data, error } = await supabase!
        .from('leads')
        .select('*')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
      if (error) console.error(error)
      setRows((data as Lead[]) ?? [])

      const { data: members } = await supabase!.from('team_members').select('*').order('sort_order')
      setRoster((members as TeamMember[]) ?? [])
    }
    load()
  }, [nav])

  function copyLink(token: string) {
    const url = `${window.location.origin}/l/${token}`
    navigator.clipboard.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied(null), 1800)
  }

  function agentName(id: string | null) {
    return roster.find((m) => m.id === id)?.full_name ?? null
  }

  if (!rows) return <div className="centered"><div className="spinner" /></div>

  return (
    <div className="admin">
      {DEMO_MODE && (
        <div className="demobar">
          Demo data — no database connected yet. Nothing you change here is saved.
        </div>
      )}

      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 15 }}>Active Buyers</span>
        <nav className="adminnav">
          <Link className="btn" to="/admin">Transactions</Link>
          <button className="btn primary" onClick={() => setCreating(true)}>
            New lead
          </button>
        </nav>
      </header>

      {creating && (
        <NewLead
          roster={roster}
          onCancel={() => setCreating(false)}
          onCreated={(newId) => nav(`/admin/leads/${newId}`)}
        />
      )}

      {rows.length === 0 ? (
        <div className="centered">
          <div style={{ maxWidth: 360 }}>
            <p className="muted" style={{ lineHeight: 1.7 }}>
              No active buyers yet. Add one and you'll get a link you can text
              straight to them — appointments, homes you're showing, and their
              must-haves, all in one place.
            </p>
          </div>
        </div>
      ) : (
        <div className="txlist">
          {rows.map((r) => {
            const band = leadTimeframeBand(r)
            return (
              <div className="txcard" key={r.id}>
                <Link to={`/admin/leads/${r.id}`} className="txmain">
                  {band && (
                    <span
                      title={TIMEFRAME_BAND_LABEL[band]}
                      style={{
                        flex: 'none', width: 12, height: 12, borderRadius: '50%',
                        background: TIMEFRAME_BAND_COLOR[band],
                      }}
                    />
                  )}
                  <div className="txinfo">
                    <div className="txaddr">{r.full_name || 'Unnamed buyer'}</div>
                    <div className="txcity">{agentName(r.realtor_member_id) ?? 'No agent assigned'}</div>
                    <div className="txmeta">
                      <span className="tag">Active buyer</span>
                      {r.buyer_broker_signed
                        ? <span className="muted">Buyer broker signed</span>
                        : <span className="muted">Buyer broker not signed</span>}
                    </div>
                  </div>
                </Link>
                <button className="btn" onClick={() => copyLink(r.share_token)}>
                  {copied === r.share_token ? 'Copied' : 'Copy client link'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NewLead({ roster, onCancel, onCreated }: {
  roster: TeamMember[]; onCancel: () => void; onCreated: (id: string) => void
}) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [agentId, setAgentId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (DEMO_MODE || !supabase) {
      setErr('There’s no database connected yet, so this can’t save a real lead.')
      return
    }
    setBusy(true); setErr(null)

    const { data: me } = await supabase.from('profiles')
      .select('team_id').eq('id', (await supabase.auth.getUser()).data.user?.id).single()
    if (!me?.team_id) { setErr('Couldn’t work out which team you’re on.'); setBusy(false); return }

    const { data: lead, error } = await supabase.from('leads')
      .insert({
        team_id: me.team_id,
        full_name: fullName,
        phone: phone || null,
        email: email || null,
        realtor_member_id: agentId || null,
      })
      .select('id').single()

    if (error || !lead) { setErr(error?.message ?? 'Could not create it.'); setBusy(false); return }
    onCreated(lead.id)
  }

  return (
    <form className="card setcard newtx" onSubmit={create}>
      <h2>New active buyer</h2>
      <p className="sethelp">
        Just their name to start — everything else you fill in on their page.
      </p>

      <div className="field2">
        <div className="field">
          <label>Buyer's name</label>
          <input value={fullName} autoFocus required
                 onChange={(e) => setFullName(e.target.value)}
                 placeholder="Marcus Webb" />
        </div>
        <div className="field">
          <label>Assigned agent</label>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
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
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(407) 555-0100" />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                 placeholder="marcus@example.com" />
        </div>
      </div>

      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}

      <div className="savebar">
        <button className="btn primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create it'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
