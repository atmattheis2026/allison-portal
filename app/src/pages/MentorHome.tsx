import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import { MENTORS, NETWORK_AGENTS } from '../lib/demoData'
import type { NetworkAgent, NetworkAgentStatus } from '../lib/types'
import { NETWORK_AGENT_STATUS_LABEL } from '../lib/types'
import './Admin.css'

const STATUS_COLOR: Record<NetworkAgentStatus, string> = {
  lead: 'var(--ink-faint)',
  training: '#d4a017',
  active: '#2ecc40',
  inactive: 'var(--ink-faint)',
}

/**
 * What a mentor sees after signing in — only the agents assigned to them.
 * No AdminNav here on purpose: mentors have exactly two pages (this list and
 * an agent's page), nothing else in the app is theirs to reach.
 */
export default function MentorHome() {
  const [rows, setRows] = useState<NetworkAgent[] | null>(null)
  const [mentorName, setMentorName] = useState<string | null>(null)
  const nav = useNavigate()

  useEffect(() => {
    if (DEMO_MODE || !supabase) {
      const mine = MENTORS.find((m) => m.id === 'mn-derek')!
      setMentorName(mine.full_name)
      setRows(NETWORK_AGENTS.filter((a) => a.mentor_id === mine.id))
      return
    }

    async function load() {
      const { data: auth } = await supabase!.auth.getUser()
      if (!auth.user) { nav('/login'); return }

      const { data: mine } = await supabase!.from('mentors')
        .select('full_name').eq('profile_id', auth.user.id).maybeSingle()
      setMentorName(mine?.full_name ?? null)

      const { data, error } = await supabase!
        .from('network_agents')
        .select('*')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
      if (error) console.error(error)
      setRows((data as NetworkAgent[]) ?? [])
    }
    load()
  }, [nav])

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    nav('/login')
  }

  if (!rows) return <div className="centered"><div className="spinner" /></div>

  return (
    <div className="admin">
      {DEMO_MODE && (
        <div className="demobar">
          Demo data — no database connected yet.
        </div>
      )}

      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 15 }}>
          My agents{mentorName ? ` — ${mentorName}` : ''}
        </span>
        <nav className="adminnav">
          <button className="btn" onClick={signOut}>Sign out</button>
        </nav>
      </header>

      {rows.length === 0 ? (
        <div className="centered">
          <p className="muted" style={{ maxWidth: 360, lineHeight: 1.7, textAlign: 'center' }}>
            No agents assigned to you yet.
          </p>
        </div>
      ) : (
        <div className="txlist">
          {rows.map((r) => (
            <div className="txcard" key={r.id}>
              <Link to={`/mentor/${r.id}`} className="txmain">
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
                  <div className="txmeta">
                    <span className="tag">{NETWORK_AGENT_STATUS_LABEL[r.status]}</span>
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
