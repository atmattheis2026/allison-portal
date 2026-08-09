import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { Lead, TeamMember } from '../lib/types'
import AdminNav from '../components/AdminNav'
import { useIsDatabaseManager } from '../lib/useIsDatabaseManager'
import './Admin.css'

/**
 * Clients whose transaction has been marked Closed & Funded (see
 * AdminTransaction.tsx). Their Active Buyer file — appointments, homes
 * shown, wants/needs, all of it — stays exactly where it was; this is just
 * a different list pointing at the same /admin/leads/:id page, filtered to
 * lead_status = 'closed' instead of active/under_contract.
 */
export default function AdminClosed() {
  const [rows, setRows] = useState<Lead[] | null>(null)
  const [roster, setRoster] = useState<TeamMember[]>([])
  const nav = useNavigate()

  useEffect(() => {
    if (DEMO_MODE || !supabase) { setRows([]); return }

    async function load() {
      const { data: auth } = await supabase!.auth.getUser()
      if (!auth.user) { nav('/login'); return }

      const { data, error } = await supabase!
        .from('leads')
        .select('*')
        .eq('lead_status', 'closed')
        .order('closed_date', { ascending: false })
      if (error) console.error(error)
      setRows((data as Lead[]) ?? [])

      const { data: members } = await supabase!.from('team_members').select('*').order('sort_order')
      setRoster((members as TeamMember[]) ?? [])
    }
    load()
  }, [nav])

  function agentName(memberId: string | null) {
    return roster.find((m) => m.id === memberId)?.full_name ?? null
  }

  const isDatabaseManager = useIsDatabaseManager()

  async function deleteLead(r: Lead) {
    if (!confirm(`Permanently delete "${r.full_name || 'this buyer'}"? This can't be undone.`)) return
    setRows((cur) => cur?.filter((x) => x.id !== r.id) ?? cur)
    if (DEMO_MODE || !supabase) return
    const { error } = await supabase.from('leads').delete().eq('id', r.id)
    if (error) alert(`Couldn't delete it: ${error.message}`)
  }

  if (!rows) return <div className="centered"><div className="spinner" /></div>

  return (
    <div className="admin">
      {DEMO_MODE && (
        <div className="demobar">
          Demo data — no database connected yet. Nothing here is real.
        </div>
      )}

      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 15 }}>Closed</span>
      </header>
      <AdminNav current="closed" />

      {rows.length === 0 ? (
        <div className="centered">
          <div style={{ maxWidth: 360 }}>
            <p className="muted" style={{ lineHeight: 1.7 }}>
              Nobody here yet. A client shows up on this list once their transaction is
              marked Closed &amp; Funded.
            </p>
          </div>
        </div>
      ) : (
        <div className="txlist">
          {rows.map((r) => (
            <div className="txcard" key={r.id} style={{ borderLeft: '5px solid #2ecc40' }}>
              <Link to={`/admin/leads/${r.id}`} className="txmain">
                <div className="txinfo">
                  <div className="txaddr">{r.full_name || 'Unnamed buyer'}</div>
                  <div className="txcity">{agentName(r.realtor_member_id) ?? 'No agent assigned'}</div>
                  <div className="txmeta">
                    <span className="tag" style={{ borderColor: '#2ecc40', color: '#2ecc40' }}>Closed</span>
                    {r.closed_date && (
                      <span className="muted">
                        {new Date(r.closed_date + 'T00:00:00').toLocaleDateString('en-US', {
                          year: 'numeric', month: 'long', day: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              {isDatabaseManager && (
                <button className="btn" style={{ color: 'var(--danger, #cc3311)' }}
                        onClick={() => deleteLead(r)} title="Permanently delete this file">
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
