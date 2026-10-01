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

// The Clients page's three columns (Allison, 2026-10-01). Under contract is
// automatic (a deal exists); Upcoming and Nurture she sets per client.
// Inactive sits below the board, folded away.
const COLUMNS = [
  { key: 'under_contract', label: 'Under contract', help: 'Has an open deal. Moves here on its own.' },
  { key: 'active', label: 'Upcoming', help: 'Actively looking, buying soon.' },
  { key: 'nurture', label: 'Nurture', help: '6+ months out. Keep in touch with follow-ups.' },
] as const
function columnFor(r: Lead): string { return r.lead_status === 'under_contract' ? 'under_contract' : r.lead_status }
function parseDate(d: string) { const [y, m, day] = d.split('-').map(Number); return new Date(y, m - 1, day) }

type SortMode = 'recent' | 'name' | 'broker_signed' | 'broker_expires' | 'color' | 'comms'

interface Comm { at: string; text: string; kind: 'referral' | 'showing' | 'offer'; id: string }

interface ReferralRow { id: string; lead_id: string; name: string; created_at: string }
interface ShowingRow { id: string; lead_id: string; address_line: string | null; showing_requested_at: string | null }
interface OfferRow { id: string; lead_id: string; address_line: string | null; offer_requested_at: string | null }
interface LatestNote { lead_id: string; author_name: string | null; body: string; created_at: string }

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
  const [latestNotes, setLatestNotes] = useState<Record<string, LatestNote[]>>({})
  const [showInactive, setShowInactive] = useState(false)
  const [stageError, setStageError] = useState<string | null>(null)
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

      // Most recent post from each client's "Updates" box, so the list shows
      // at a glance where things were left. Newest first, so the first one
      // seen per client is the latest.
      const leadIds = ((data as Lead[]) ?? []).map((l) => l.id)
      if (leadIds.length) {
        const { data: noteData } = await supabase!.from('lead_notes')
          .select('lead_id, author_name, body, created_at')
          .in('lead_id', leadIds)
          .order('created_at', { ascending: false })
        const latest: Record<string, LatestNote[]> = {}
        for (const n of (noteData as LatestNote[]) ?? []) {
          const list = (latest[n.lead_id] ??= [])
          if (list.length < 1) list.push(n)
        }
        setLatestNotes(latest)
      }
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

  // 079 adds next_followup; without it, stages other than the automatic
  // ones can't save, so the controls hide and the page says what to run.
  const hasStages = rows.length === 0 || 'next_followup' in rows[0]
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const isDue = (r: Lead) => Boolean(r.next_followup) && parseDate(r.next_followup!) <= today
  const dueCount = rows.filter((r) => r.lead_status !== 'inactive' && isDue(r)).length
  const inactiveRows = sortedRows.filter((r) => r.lead_status === 'inactive')
  // Follow-ups that are due first, then the soonest scheduled, then the rest.
  const byFollowup = (a: Lead, b: Lead) => {
    const fa = a.next_followup ?? '9999', fb = b.next_followup ?? '9999'
    return fa.localeCompare(fb)
  }

  async function patchRow(id: string, values: Partial<Lead>) {
    setStageError(null)
    setRows((cur) => cur?.map((r) => (r.id === id ? { ...r, ...values } : r)) ?? cur)
    if (DEMO_MODE || !supabase) return
    const { error } = await supabase.from('leads').update(values).eq('id', id)
    if (error) setStageError(error.message)
  }

  function renderCard(r: Lead) {
    const underContract = r.lead_status === 'under_contract'
    const band = leadTimeframeBand(r)
    const due = isDue(r)
    const notes = latestNotes[r.id] ?? []
    return (
      <div className={`clientcard${due ? ' due' : ''}`} key={r.id}>
        <div className="clienttop">
          {!underContract && band && (
            <span title={TIMEFRAME_BAND_LABEL[band]} className="clientdot" style={{ background: TIMEFRAME_BAND_COLOR[band] }} />
          )}
          <Link to={`/admin/leads/${r.id}`} className="clientname">
            {r.full_name || 'Unnamed client'}{r.full_name_2 ? ` & ${r.full_name_2}` : ''}
          </Link>
          {!underContract && hasStages && (
            <select className="clientstage" value={r.lead_status} aria-label="Move to"
                    onChange={(e) => patchRow(r.id, { lead_status: e.target.value as Lead['lead_status'] })}>
              <option value="active">Upcoming</option>
              <option value="nurture">Nurture</option>
              <option value="inactive">Inactive</option>
            </select>
          )}
        </div>
        <div className="clientmeta">
          {[agentName(r.realtor_member_id) ?? 'No agent',
            r.wants_buying && r.wants_loan ? 'Buyer + loan' : r.wants_loan ? 'Loan' : 'Buyer',
            r.wants_loan && r.loan_status ? r.loan_status : null].filter(Boolean).join(' · ')}
          {r.wants_buying && !underContract && (
            <div>{r.buyer_broker_signed
              ? `Buyer broker signed ${r.buyer_broker_signed_date ? daysAgo(r.buyer_broker_signed_date) : ''}`
                + (r.buyer_broker_expires ? ` · expires ${new Date(r.buyer_broker_expires + 'T00:00:00').toLocaleDateString()}` : '')
              : 'Buyer broker not signed'}</div>
          )}
        </div>

        {comms[r.id] && (
          <div className="clientcomm">
            <span>{comms[r.id].text} · {commWhen(comms[r.id].at)}</span>
            <button type="button" className="linkbtn" disabled={resolvingId === comms[r.id].id}
                    onClick={() => resolveComm(comms[r.id])}>
              {resolvingId === comms[r.id].id ? 'Marking…' : 'Mark handled'}
            </button>
          </div>
        )}

        {hasStages && (
          <div className="clientfollow">
            <span className={`followlabel${due ? ' due' : ''}`}>
              {due ? (parseDate(r.next_followup!) < today ? 'Overdue' : 'Due today') : 'Follow up'}
            </span>
            <input type="date" value={r.next_followup ?? ''} aria-label="Follow-up date"
                   onChange={(e) => patchRow(r.id, { next_followup: e.target.value || null })} />
            <input className="followwhat" defaultValue={r.followup_note ?? ''} key={`fn-${r.id}-${r.followup_note ?? ''}`}
                   placeholder="What for? (just for you)"
                   onBlur={(e) => { if ((e.target.value || null) !== (r.followup_note ?? null)) patchRow(r.id, { followup_note: e.target.value || null }) }}
                   onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
            {r.next_followup && (
              <button type="button" className="linkbtn" title="Clear the follow-up"
                      onClick={() => patchRow(r.id, { next_followup: null, followup_note: null })}>Done</button>
            )}
          </div>
        )}

        {notes.length > 0 && (
          <Link to={`/admin/leads/${r.id}`} className="clientnotes">
            {notes.map((n, i) => (
              <span key={i} className="clientnote">
                <span className="clientnotewhen">{commWhen(n.created_at)}{n.author_name ? ` · ${n.author_name}` : ''}</span>
                {n.body}
              </span>
            ))}
          </Link>
        )}

        <div className="clientacts">
          <button type="button" className="linkbtn" onClick={() => copyLink(r.share_token)}>
            {copied === r.share_token ? 'Copied' : 'Copy client link'}
          </button>
          {isDatabaseManager && (
            <button type="button" className="linkbtn danger" onClick={() => deleteLead(r)}
                    title="Permanently delete this file">Delete</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="admin">
      {DEMO_MODE && (
        <div className="demobar">
          Demo data — no database connected yet. Nothing you change here is saved.
        </div>
      )}

      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 17.5 }}>Clients</span>
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
          <label className="muted" style={{ fontSize: 15.5, whiteSpace: 'nowrap' }}>Sort by</label>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} style={{ width: 'auto', maxWidth: '100%' }}>
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
              No clients yet. Add one and you'll get a link you can text
              straight to them — appointments, homes you're showing, and their
              must-haves, all in one place.
            </p>
          </div>
        </div>
      ) : (
        <>
          {!hasStages && (
            <p className="sethelp" style={{ margin: '0 24px 14px', color: 'var(--danger)', fontWeight: 600, overflowWrap: 'anywhere' }}>
              One database step turns on Nurture and follow-up dates: in Supabase's SQL Editor, run
              supabase/migrations/079_client_stages_and_followups.sql, then reload this page.
            </p>
          )}
          {stageError && (
            <p className="sethelp" style={{ margin: '0 24px 14px', color: 'var(--danger)', fontWeight: 600 }}>
              That change didn't save: {stageError}
            </p>
          )}
          {dueCount > 0 && (
            <p style={{ margin: '0 24px 12px', fontWeight: 700, color: '#8A5A12' }}>
              {dueCount} follow-up{dueCount === 1 ? '' : 's'} due today or overdue
            </p>
          )}
          <div className="clientboard">
            {COLUMNS.map((col) => {
              const list = sortedRows.filter((r) => columnFor(r) === col.key)
              const ordered = col.key === 'under_contract' ? list : [...list].sort(byFollowup)
              return (
                <section key={col.key} className={`clientcol ${col.key}`}
                         style={col.key === 'under_contract' ? { borderTopColor: UNDER_CONTRACT_COLOR } : undefined}>
                  <h2 className="clientcolhdr">
                    {col.label} <span className="clientcount">{list.length}</span>
                  </h2>
                  <p className="clientcolhelp">{col.help}</p>
                  {ordered.length === 0 && <p className="muted" style={{ fontSize: 14.5, margin: '6px 2px' }}>No one here right now.</p>}
                  {ordered.map(renderCard)}
                </section>
              )
            })}
          </div>
          {inactiveRows.length > 0 && (
            <div style={{ padding: '18px 24px 0' }}>
              <button type="button" className="btn" onClick={() => setShowInactive((v) => !v)}>
                {showInactive ? 'Hide inactive' : `Inactive (${inactiveRows.length})`}
              </button>
              {showInactive && <div className="clientinactive">{inactiveRows.map(renderCard)}</div>}
            </div>
          )}
        </>
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
  // Files that look like the same person (same name, phone or email). Shown
  // before creating, so she opens the existing file instead of making a
  // second one; "Create anyway" skips the check.
  const [possibleDupes, setPossibleDupes] = useState<{ id: string; full_name: string; lead_status: string }[] | null>(null)

  // Typing a different name/phone/email means the warning no longer applies.
  useEffect(() => { setPossibleDupes(null) }, [fullName, phone, email])

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

    if (!possibleDupes) {
      const { data: existing } = await supabase.from('leads')
        .select('id, full_name, phone, email, lead_status').eq('team_id', me.team_id)
      const name = fullName.trim().toLowerCase()
      const ph = phone.replace(/\D/g, '')
      const em = email.trim().toLowerCase()
      const hits = ((existing ?? []) as { id: string; full_name: string | null; phone: string | null; email: string | null; lead_status: string }[])
        .filter((l) => (name && (l.full_name ?? '').trim().toLowerCase() === name)
          || (ph.length >= 7 && (l.phone ?? '').replace(/\D/g, '') === ph)
          || (em && (l.email ?? '').trim().toLowerCase() === em))
        .map((l) => ({ id: l.id, full_name: l.full_name || 'Unnamed client', lead_status: l.lead_status }))
      if (hits.length) { setPossibleDupes(hits); setBusy(false); return }
    }

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
      {possibleDupes && (
        <div style={{ border: '1px solid var(--danger)', background: '#FBEDEA', borderRadius: 'var(--r-md)',
                      padding: '12px 14px', margin: '8px 0 14px' }}>
          <strong style={{ color: 'var(--danger)' }}>This client may already have a file:</strong>
          <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
            {possibleDupes.map((d) => (
              <li key={d.id}>
                <Link to={`/admin/leads/${d.id}`}>{d.full_name}</Link>
                <span className="muted"> · {d.lead_status === 'closed' ? 'Closed' : d.lead_status === 'under_contract' ? 'Under contract' : 'Active'}</span>
              </li>
            ))}
          </ul>
          <span className="muted" style={{ fontSize: 15 }}>
            Open their file above, or press <strong>Create anyway</strong> if this is a different person.
          </span>
        </div>
      )}
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

      {err && <p style={{ color: 'var(--danger)', fontSize: 15.5 }}>{err}</p>}

      <div className="savebar">
        <button className="btn primary" disabled={busy}>
          {busy ? 'Creating…' : possibleDupes ? 'Create anyway' : 'Create it'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
