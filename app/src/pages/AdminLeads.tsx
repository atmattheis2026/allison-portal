import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { Lead, TeamMember, TimeframeBand } from '../lib/types'
import { leadTimeframeBand, TIMEFRAME_BAND_COLOR, TIMEFRAME_BAND_LABEL } from '../lib/types'
import AdminNav from '../components/AdminNav'
import { useIsDatabaseManager } from '../lib/useIsDatabaseManager'
import './Admin.css'

// Most-urgent-to-nurture first — orange (furthest out, most at risk of
// drifting to another agent) leads, then yellow, then green.
const BAND_SORT_RANK: Record<TimeframeBand, number> = { orange: 0, yellow: 1, green: 2 }

// Distinct from the green/yellow/orange nurture scale and the red BBA-urgency
// accent — under contract is a different kind of status, not an urgency level.
const UNDER_CONTRACT_COLOR = '#3b82f6'

type SortMode = 'recent' | 'name' | 'broker_signed' | 'broker_expires' | 'color' | 'comms'

interface Comm { at: string; text: string; kind: 'referral' | 'showing' | 'offer'; id: string }

interface ReferralRow { id: string; lead_id: string; name: string; created_at: string }
interface ShowingRow { id: string; lead_id: string; address_line: string | null; showing_requested_at: string | null }
interface OfferRow { id: string; lead_id: string; address_line: string | null; offer_requested_at: string | null }

/**
 * "Active Clients" — people still pre-contract, whether they're house
 * hunting, working a loan, or both (wants_buying/wants_loan, independent
 * flags on the same record — see migration 054). Lighter cousin of
 * AdminList: no address, no status rail, just who they are and who's
 * working with them. RLS already limits `rows` to leads this signed-in
 * person can see (their own, or all of them if they see every transaction).
 */
export default function AdminLeads() {
  const [rows, setRows] = useState<Lead[] | null>(null)
  const [roster, setRoster] = useState<TeamMember[]>([])
  const [referrals, setReferrals] = useState<ReferralRow[]>([])
  const [showings, setShowings] = useState<ShowingRow[]>([])
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('recent')
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
        .neq('lead_status', 'closed')
        .order('created_at', { ascending: false })
      if (error) console.error(error)
      setRows((data as Lead[]) ?? [])

      const { data: members } = await supabase!.from('team_members').select('*').order('sort_order')
      setRoster((members as TeamMember[]) ?? [])

      // Three separate places a client can act on their own page — a
      // referral, a showing request, or an offer request. Whichever
      // happened most recently per lead is what shows up front and center
      // on the list. Resolved ones are left out — that's how "mark as
      // handled" makes them disappear.
      const [{ data: referralData }, { data: showingData }, { data: offerData }] = await Promise.all([
        supabase!.from('lead_referrals').select('id, lead_id, name, created_at')
          .eq('submitted_by', 'client').eq('resolved', false),
        supabase!.from('lead_maybe_homes').select('id, lead_id, address_line, showing_requested_at')
          .eq('showing_requested', true).eq('showing_request_resolved', false),
        supabase!.from('lead_homes').select('id, lead_id, address_line, offer_requested_at')
          .eq('offer_requested', true).eq('offer_request_resolved', false),
      ])
      setReferrals((referralData as ReferralRow[]) ?? [])
      setShowings((showingData as ShowingRow[]) ?? [])
      setOffers((offerData as OfferRow[]) ?? [])
    }
    load()
  }, [nav])

  const comms = useMemo(() => {
    const next: Record<string, Comm> = {}
    function consider(leadId: string, at: string | null, text: string, kind: Comm['kind'], id: string) {
      if (!at) return
      const existing = next[leadId]
      if (!existing || at > existing.at) next[leadId] = { at, text, kind, id }
    }
    for (const r of referrals) consider(r.lead_id, r.created_at, `Referred a friend — ${r.name}`, 'referral', r.id)
    for (const s of showings) consider(s.lead_id, s.showing_requested_at, `Requested a showing — ${s.address_line || 'a home'}`, 'showing', s.id)
    for (const o of offers) consider(o.lead_id, o.offer_requested_at, `Ready to make an offer — ${o.address_line || 'a home'}`, 'offer', o.id)
    return next
  }, [referrals, showings, offers])

  async function resolveComm(comm: Comm) {
    if (!supabase || resolvingId) return
    setResolvingId(comm.id)
    const target = comm.kind === 'referral'
      ? { table: 'lead_referrals' as const, col: 'resolved' as const }
      : comm.kind === 'showing'
      ? { table: 'lead_maybe_homes' as const, col: 'showing_request_resolved' as const }
      : { table: 'lead_homes' as const, col: 'offer_request_resolved' as const }
    const { error } = await supabase.from(target.table).update({ [target.col]: true }).eq('id', comm.id)
    setResolvingId(null)
    if (error) { alert(error.message); return }
    if (comm.kind === 'referral') setReferrals((cur) => cur.filter((x) => x.id !== comm.id))
    else if (comm.kind === 'showing') setShowings((cur) => cur.filter((x) => x.id !== comm.id))
    else setOffers((cur) => cur.filter((x) => x.id !== comm.id))
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/l/${token}`
    navigator.clipboard.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied(null), 1800)
  }

  const isDatabaseManager = useIsDatabaseManager()

  async function deleteLead(r: Lead) {
    if (!confirm(`Permanently delete "${r.full_name || 'this buyer'}"? This can't be undone — appointments, homes, notes, and everything else on their file goes with it.`)) return
    setRows((cur) => cur?.filter((x) => x.id !== r.id) ?? cur)
    if (DEMO_MODE || !supabase) return
    const { error } = await supabase.from('leads').delete().eq('id', r.id)
    if (error) alert(`Couldn't delete it: ${error.message}`)
  }

  function agentName(id: string | null) {
    return roster.find((m) => m.id === id)?.full_name ?? null
  }

  function daysAgo(dateStr: string) {
    const days = Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000)
    if (days < 0) return ''
    if (days === 0) return '(today)'
    if (days < 30) return `(${days}d ago)`
    const months = Math.round(days / 30.44)
    return `(${months} mo ago)`
  }

  function commWhen(iso: string) {
    const ms = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(ms / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days === 1) return 'yesterday'
    if (days < 7) return `${days}d ago`
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const sortedRows = useMemo(() => {
    if (!rows) return null
    const list = [...rows]
    switch (sortMode) {
      case 'name':
        list.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
        break
      case 'broker_expires':
        // No date on file sorts to the bottom rather than the top.
        list.sort((a, b) => {
          if (!a.buyer_broker_expires) return 1
          if (!b.buyer_broker_expires) return -1
          return a.buyer_broker_expires.localeCompare(b.buyer_broker_expires)
        })
        break
      case 'broker_signed':
        // Oldest signed date first — that's the one sitting the longest
        // with no contract, the one most at risk of drifting to another agent.
        list.sort((a, b) => {
          if (!a.buyer_broker_signed_date) return 1
          if (!b.buyer_broker_signed_date) return -1
          return a.buyer_broker_signed_date.localeCompare(b.buyer_broker_signed_date)
        })
        break
      case 'color':
        list.sort((a, b) => {
          const ba = leadTimeframeBand(a)
          const bb = leadTimeframeBand(b)
          if (!ba) return 1
          if (!bb) return -1
          return BAND_SORT_RANK[ba] - BAND_SORT_RANK[bb]
        })
        break
      case 'comms':
        // Whoever communicated most recently floats to the top — no
        // communication on file sorts to the bottom.
        list.sort((a, b) => {
          const ca = comms[a.id]?.at
          const cb = comms[b.id]?.at
          if (!ca && !cb) return 0
          if (!ca) return 1
          if (!cb) return -1
          return cb.localeCompare(ca)
        })
        break
      default:
        list.sort((a, b) => b.created_at.localeCompare(a.created_at))
    }
    return list
  }, [rows, sortMode, comms])

  if (!rows || !sortedRows) return <div className="centered"><div className="spinner" /></div>

  return (
    <div className="admin">
      {DEMO_MODE && (
        <div className="demobar">
          Demo data — no database connected yet. Nothing you change here is saved.
        </div>
      )}

      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 15 }}>Active Clients</span>
        <nav className="adminnav">
          <button className="btn primary" onClick={() => setCreating(true)}>
            New client
          </button>
        </nav>
      </header>
      <AdminNav current="leads" />

      {creating && (
        <NewLead
          roster={roster}
          onCancel={() => setCreating(false)}
          onCreated={(newId) => nav(`/admin/leads/${newId}`)}
        />
      )}

      {rows.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 24px 12px' }}>
          <label className="muted" style={{ fontSize: 13 }}>Sort by</label>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
            <option value="recent">Recently added</option>
            <option value="name">Name (A–Z)</option>
            <option value="broker_signed">Buyer broker signed date (oldest first)</option>
            <option value="broker_expires">Buyer broker expiration</option>
            <option value="color">Timeframe (needs nurturing first)</option>
            <option value="comms">New client communications</option>
          </select>
        </div>
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
          {sortedRows.map((r) => {
            const band = leadTimeframeBand(r)
            const underContract = r.lead_status === 'under_contract'
            const borderColor = underContract ? UNDER_CONTRACT_COLOR : band ? TIMEFRAME_BAND_COLOR[band] : undefined
            return (
              <div className="txcard" key={r.id}
                   style={borderColor ? { borderLeft: `5px solid ${borderColor}` } : undefined}>
                <Link to={`/admin/leads/${r.id}`} className="txmain" style={{ flex: '0 1 340px', minWidth: 220 }}>
                  {underContract ? (
                    <span
                      title="Under contract"
                      style={{
                        flex: 'none', width: 18, height: 18, borderRadius: '50%',
                        background: UNDER_CONTRACT_COLOR,
                        boxShadow: `0 0 0 3px ${UNDER_CONTRACT_COLOR}33`,
                      }}
                    />
                  ) : band && (
                    <span
                      title={TIMEFRAME_BAND_LABEL[band]}
                      style={{
                        flex: 'none', width: 18, height: 18, borderRadius: '50%',
                        background: TIMEFRAME_BAND_COLOR[band],
                        boxShadow: `0 0 0 3px ${TIMEFRAME_BAND_COLOR[band]}33`,
                      }}
                    />
                  )}
                  <div className="txinfo">
                    <div className="txaddr">{r.full_name || 'Unnamed buyer'}</div>
                    <div className="txcity">{agentName(r.realtor_member_id) ?? 'No agent assigned'}</div>
                    <div className="txmeta">
                      {underContract ? (
                        <span className="tag" style={{ borderColor: UNDER_CONTRACT_COLOR, color: UNDER_CONTRACT_COLOR, fontWeight: 700 }}>
                          UNDER CONTRACT
                        </span>
                      ) : (
                        <span className="tag">
                          {r.wants_buying && r.wants_loan ? 'Buyer + Loan' : r.wants_loan ? 'Loan client' : 'Buyer'}
                        </span>
                      )}
                      {r.wants_buying && (
                        r.buyer_broker_signed
                          ? <span className="muted">
                              Buyer broker signed
                              {r.buyer_broker_signed_date && ` ${daysAgo(r.buyer_broker_signed_date)}`}
                              {r.buyer_broker_expires && ` — expires ${new Date(r.buyer_broker_expires + 'T00:00:00').toLocaleDateString()}`}
                            </span>
                          : <span className="muted">Buyer broker not signed</span>
                      )}
                      {r.wants_loan && r.loan_status && (
                        <span className="muted">{r.loan_status}</span>
                      )}
                    </div>
                  </div>
                </Link>
                {comms[r.id] && (
                  <div className="txcomm">
                    <div className="txcommtext">{comms[r.id].text}</div>
                    <div className="txcommfoot">
                      <span className="txcommwhen">{commWhen(comms[r.id].at)}</span>
                      <button
                        type="button" className="btn" style={{ flex: 'none' }}
                        disabled={resolvingId === comms[r.id].id}
                        onClick={() => resolveComm(comms[r.id])}
                      >
                        {resolvingId === comms[r.id].id ? 'Marking…' : 'Mark handled'}
                      </button>
                    </div>
                  </div>
                )}
                <button className="btn" onClick={() => copyLink(r.share_token)}>
                  {copied === r.share_token ? 'Copied' : 'Copy client link'}
                </button>
                {isDatabaseManager && (
                  <button className="btn" style={{ color: 'var(--danger, #cc3311)' }}
                          onClick={() => deleteLead(r)} title="Permanently delete this file">
                    Delete
                  </button>
                )}
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
  const [wantsBuying, setWantsBuying] = useState(true)
  const [wantsLoan, setWantsLoan] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (DEMO_MODE || !supabase) {
      setErr('There’s no database connected yet, so this can’t save a real lead.')
      return
    }
    if (!wantsBuying && !wantsLoan) { setErr('Pick at least one — buying, a loan, or both.'); return }
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
        wants_buying: wantsBuying,
        wants_loan: wantsLoan,
      })
      .select('id').single()

    if (error || !lead) { setErr(error?.message ?? 'Could not create it.'); setBusy(false); return }
    onCreated(lead.id)
  }

  return (
    <form className="card setcard newtx" onSubmit={create}>
      <h2>New active client</h2>
      <p className="sethelp">
        Just their name to start — everything else you fill in on their page.
      </p>

      <div className="field">
        <label>What do they need?</label>
        <div className="tabs">
          <button type="button" className={`tab${wantsBuying ? ' on' : ''}`}
                  onClick={() => setWantsBuying((v) => !v)}>
            Buying a home
          </button>
          <button type="button" className={`tab${wantsLoan ? ' on' : ''}`}
                  onClick={() => setWantsLoan((v) => !v)}>
            A loan
          </button>
        </div>
        <p className="sethelp" style={{ margin: '6px 0 0' }}>
          Pick either or both — their page only shows the sections that apply.
        </p>
      </div>

      <div className="field2">
        <div className="field">
          <label>Client's name</label>
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
