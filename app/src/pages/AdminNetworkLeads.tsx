import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import { MENTORS, NETWORK_AGENTS } from '../lib/demoData'
import type { Mentor, NetworkAgent, NetworkAgentStatus } from '../lib/types'
import { NETWORK_AGENT_STATUS_LABEL } from '../lib/types'
import AdminNav from '../components/AdminNav'
import './Admin.css'

const STATUS_COLOR: Record<NetworkAgentStatus, string> = {
  lead: 'var(--ink-faint)',
  training: '#d4a017',
  active: '#2ecc40',
  inactive: 'var(--ink-faint)',
}

type SortMode = 'recent' | 'name' | 'status' | 'mentor'

/**
 * Primary page for Agent Recruiting: everyone being recruited, trained, or
 * mentored, in one list, status shown as a colored dot the same way Active
 * Clients shows nurture urgency. Clicking a row opens their Agent page.
 */
export default function AdminNetworkLeads() {
  const [rows, setRows] = useState<NetworkAgent[] | null>(null)
  const [mentors, setMentors] = useState<Mentor[]>([])
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const nav = useNavigate()

  useEffect(() => {
    if (DEMO_MODE || !supabase) {
      setRows(NETWORK_AGENTS)
      setMentors(MENTORS)
      return
    }

    async function load() {
      const { data: auth } = await supabase!.auth.getUser()
      if (!auth.user) { nav('/login'); return }

      const { data, error } = await supabase!
        .from('network_agents')
        .select('*')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
      if (error) console.error(error)
      setRows((data as NetworkAgent[]) ?? [])

      const { data: mentorRows } = await supabase!.from('mentors').select('*').order('sort_order')
      setMentors((mentorRows as Mentor[]) ?? [])
    }
    load()
  }, [nav])

  function mentorName(id: string | null) {
    return mentors.find((m) => m.id === id)?.full_name ?? null
  }

  const visibleRows = useMemo(() => {
    if (!rows) return null
    const q = search.trim().toLowerCase()
    const filtered = q
      ? rows.filter((r) => {
          const haystack = [r.full_name, r.email, r.phone, r.source, mentorName(r.mentor_id)]
            .filter(Boolean).join(' ').toLowerCase()
          return haystack.includes(q)
        })
      : rows

    const sorted = [...filtered]
    switch (sortMode) {
      case 'name':
        sorted.sort((a, b) => a.full_name.localeCompare(b.full_name))
        break
      case 'status':
        sorted.sort((a, b) => a.status.localeCompare(b.status))
        break
      case 'mentor':
        sorted.sort((a, b) => (mentorName(a.mentor_id) || '').localeCompare(mentorName(b.mentor_id) || ''))
        break
      default:
        sorted.sort((a, b) => b.created_at.localeCompare(a.created_at))
    }
    return sorted
  }, [rows, search, sortMode, mentors])

  if (!rows) return <div className="centered"><div className="spinner" /></div>

  return (
    <div className="admin">
      {DEMO_MODE && (
        <div className="demobar">
          Demo data — no database connected yet. Nothing you change here is saved.
        </div>
      )}

      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 15 }}>Agent Recruiting</span>
        <nav className="adminnav">
          <button className="btn primary" onClick={() => setCreating(true)}>
            New lead
          </button>
        </nav>
      </header>
      <AdminNav current="network" />

      {creating && (
        <NewNetworkAgent
          onCancel={() => setCreating(false)}
          onCreated={(newId) => nav(`/admin/network/${newId}`)}
        />
      )}

      {rows.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '0 24px 12px' }}>
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, mentor, or source…"
            style={{ flex: 1, minWidth: 220, maxWidth: 420 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none', whiteSpace: 'nowrap' }}>
            <label className="muted" style={{ fontSize: 13 }}>Sort by</label>
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
              <option value="recent">Recently added</option>
              <option value="name">Name (A–Z)</option>
              <option value="status">Status</option>
              <option value="mentor">Mentor</option>
            </select>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="centered">
          <div style={{ maxWidth: 360 }}>
            <p className="muted" style={{ lineHeight: 1.7 }}>
              No leads yet. Add someone you're recruiting or mentoring and
              you'll get a page to track their progress and notes.
            </p>
          </div>
        </div>
      ) : visibleRows && visibleRows.length === 0 ? (
        <div className="centered">
          <p className="muted">No one matches "{search}".</p>
        </div>
      ) : (
        <div className="txlist">
          {visibleRows!.map((r) => (
            <div className="txcard" key={r.id}>
              <Link to={`/admin/network/${r.id}`} className="txmain">
                <span
                  title={NETWORK_AGENT_STATUS_LABEL[r.status]}
                  style={{
                    flex: 'none', width: 18, height: 18, borderRadius: '50%',
                    background: STATUS_COLOR[r.status],
                    boxShadow: `0 0 0 3px ${STATUS_COLOR[r.status]}33`,
                  }}
                />
                <div className="txinfo">
                  <div className="txaddr">{r.full_name || 'Unnamed'}</div>
                  <div className="txcity">{mentorName(r.mentor_id) ?? 'No mentor assigned'}</div>
                  <div className="txmeta">
                    <span className="tag">{NETWORK_AGENT_STATUS_LABEL[r.status]}</span>
                    {r.source && <span className="muted">· {r.source}</span>}
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NewNetworkAgent({ onCancel, onCreated }: {
  onCancel: () => void; onCreated: (id: string) => void
}) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState('')
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

    const { data: agent, error } = await supabase.from('network_agents')
      .insert({
        team_id: me.team_id,
        full_name: fullName,
        phone: phone || null,
        email: email || null,
        source: source || null,
      })
      .select('id').single()

    if (error || !agent) { setErr(error?.message ?? 'Could not create it.'); setBusy(false); return }

    await supabase.rpc('seed_network_agent', { p_agent_id: agent.id })
    onCreated(agent.id)
  }

  return (
    <form className="card setcard newtx" onSubmit={create}>
      <h2>New lead</h2>
      <p className="sethelp">
        Just their name to start — everything else you fill in on their page,
        including the training checklist and mentor assignment.
      </p>

      <div className="field2">
        <div className="field">
          <label>Name</label>
          <input value={fullName} autoFocus required
                 onChange={(e) => setFullName(e.target.value)}
                 placeholder="Jordan Reyes" />
        </div>
        <div className="field">
          <label>How did they come to you?</label>
          <input value={source} onChange={(e) => setSource(e.target.value)}
                 placeholder="e.g. Referred by Marcus Webb" />
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
                 placeholder="jordan@example.com" />
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
