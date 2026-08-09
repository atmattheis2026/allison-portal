import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { Lead, TeamMember } from '../lib/types'
import AdminNav from '../components/AdminNav'
import { useIsDatabaseManager } from '../lib/useIsDatabaseManager'
import './Admin.css'

interface ClosedTx {
  id: string
  address_line: string
  city_state_zip: string
}

/** "Marcus Webb" -> "Webb, Marcus" — names are stored as one free-text
 *  field, so this just splits on the last space. Multi-word last names
 *  (van der Berg, etc.) won't split perfectly, but it's close enough for
 *  sorting and lookup. */
function lastNameFirst(fullName: string): string {
  const trimmed = fullName.trim()
  if (!trimmed) return 'Unnamed buyer'
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`
}

/**
 * Clients whose transaction has been marked Closed & Funded (see
 * AdminTransaction.tsx). Their Active Buyer file — appointments, homes
 * shown, wants/needs, all of it — stays exactly where it was; this list
 * just points at the same /admin/leads/:id page, filtered to
 * lead_status = 'closed', plus a link to the linked /admin/t/:id
 * transaction file when there is one.
 */
export default function AdminClosed() {
  const [rows, setRows] = useState<Lead[] | null>(null)
  const [roster, setRoster] = useState<TeamMember[]>([])
  const [txById, setTxById] = useState<Record<string, ClosedTx>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
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
      const leadRows = (data as Lead[]) ?? []
      setRows(leadRows)

      const { data: members } = await supabase!.from('team_members').select('*').order('sort_order')
      setRoster((members as TeamMember[]) ?? [])

      // The address a closed buyer purchased lives on their linked
      // transaction, not the lead itself — fetch those in one batch.
      const txIds = leadRows.map((r) => r.converted_transaction_id).filter((id): id is string => Boolean(id))
      if (txIds.length) {
        const { data: txRows } = await supabase!.from('transactions')
          .select('id, address_line, city_state_zip').in('id', txIds)
        const byId: Record<string, ClosedTx> = {}
        for (const t of (txRows as ClosedTx[]) ?? []) byId[t.id] = t
        setTxById(byId)
      }
    }
    load()
  }, [nav])

  function agentName(memberId: string | null) {
    return roster.find((m) => m.id === memberId)?.full_name ?? null
  }

  const visibleRows = useMemo(() => {
    if (!rows) return null
    const q = search.trim().toLowerCase()
    const filtered = q
      ? rows.filter((r) => {
          const tx = r.converted_transaction_id ? txById[r.converted_transaction_id] : undefined
          const haystack = [
            r.full_name, r.full_name_2, tx?.address_line, tx?.city_state_zip,
            agentName(r.realtor_member_id),
          ].filter(Boolean).join(' ').toLowerCase()
          return haystack.includes(q)
        })
      : rows
    return [...filtered].sort((a, b) =>
      lastNameFirst(a.full_name || '').localeCompare(lastNameFirst(b.full_name || '')))
  }, [rows, search, txById, roster])

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

      {rows.length > 0 && (
        <div style={{ padding: '0 24px 12px' }}>
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client name, address, or agent…"
            style={{ width: '100%', maxWidth: 420 }}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <div className="centered">
          <div style={{ maxWidth: 360 }}>
            <p className="muted" style={{ lineHeight: 1.7 }}>
              Nobody here yet. A client shows up on this list once their transaction is
              marked Closed &amp; Funded.
            </p>
          </div>
        </div>
      ) : visibleRows && visibleRows.length === 0 ? (
        <div className="centered">
          <p className="muted">No closed clients match "{search}".</p>
        </div>
      ) : (
        <div className="txlist">
          {visibleRows!.map((r) => {
            const tx = r.converted_transaction_id ? txById[r.converted_transaction_id] : undefined
            const open = openId === r.id
            const addressLabel = tx
              ? `${tx.address_line}${tx.city_state_zip ? `, ${tx.city_state_zip}` : ''}`
              : r.full_name || 'Unnamed buyer'
            return (
              <div className="txcard" key={r.id} style={{ borderLeft: '5px solid #2ecc40', flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <button
                    type="button" className="txmain" style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                    onClick={() => setOpenId(open ? null : r.id)}
                  >
                    <span className="muted" style={{ fontSize: 18, flex: 'none', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block' }}>
                      ▶
                    </span>
                    <div className="txinfo">
                      <div className="txaddr">{lastNameFirst(r.full_name || '')}</div>
                      <div className="txcity">{addressLabel}</div>
                      <div className="txmeta">
                        <span className="muted">{agentName(r.realtor_member_id) ?? 'No agent assigned'}</span>
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
                  </button>
                  {isDatabaseManager && (
                    <button className="btn" style={{ color: 'var(--danger, #cc3311)', flex: 'none' }}
                            onClick={() => deleteLead(r)} title="Permanently delete this file">
                      Delete
                    </button>
                  )}
                </div>
                {open && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, paddingLeft: 32 }}>
                    <Link to={`/admin/leads/${r.id}`} className="btn" style={{ alignSelf: 'flex-start' }}>
                      Buyer file →
                    </Link>
                    {tx ? (
                      <Link to={`/admin/t/${tx.id}`} className="btn" style={{ alignSelf: 'flex-start' }}>
                        Transaction file →
                      </Link>
                    ) : (
                      <span className="muted" style={{ fontSize: 12.5 }}>No transaction linked</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
