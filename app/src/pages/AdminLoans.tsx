// Loan Clients (Allison, 2026-10-01): every client file that wants a loan,
// in three columns. In contract = has an open deal. Refi plan = their loan
// closed, showing lender, rate and notes for a future refinance. Nurture =
// everyone else who isn't inactive. Columns follow the file's status: cards
// drag up and down within a column (her own order, migration 084), and a
// Nurture card dropped on Refi plan opens "Loan closed…". Closing a deal (or "Loan closed…" in the ⋯ menu)
// moves a client to Refi plan.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { Lead, TeamMember } from '../lib/types'
import AdminNav from '../components/AdminNav'
import { CardMenu, FollowUpButton, parseDate } from '../components/ClientCardParts'
import PastClientForm from '../components/PastClientForm'
import LoanClosedDialog, { type LoanClosedValues } from '../components/LoanClosedDialog'
import './Admin.css'

type Column = 'in_contract' | 'refi' | 'nurture'
const COLUMNS: { key: Column; label: string; help: string; color: string }[] = [
  { key: 'in_contract', label: 'In contract', help: 'Has an open deal. Moves here on its own.', color: '#3b82f6' },
  { key: 'refi', label: 'Refi plan', help: 'Loan closed. Watch for a refinance.', color: 'var(--lend, #2f6f8f)' },
  { key: 'nurture', label: 'Nurture', help: 'Not under contract yet.', color: '#7FA48A' },
]

function columnFor(r: Lead): Column | 'inactive' {
  // A refi-plan client who goes under contract again (a move-up purchase or a
  // refinance deal) shows as In contract until that one closes.
  if (r.lead_status === 'under_contract') return 'in_contract'
  if (r.lead_status === 'closed' || r.loan_closed_date) return 'refi'
  if (r.lead_status === 'inactive') return 'inactive'
  return 'nurture'
}

type SortMode = 'mine' | 'followup' | 'rate' | 'rate_low' | 'type' | 'name' | 'recent'

function loanTypeOf(r: Lead) { return r.loan_type === 'Other' ? (r.loan_type_other || 'Other') : r.loan_type }

function shortDate(d: string) {
  return parseDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminLoans() {
  const [rows, setRows] = useState<Lead[] | null>(null)
  const [roster, setRoster] = useState<TeamMember[]>([])
  const [q, setQ] = useState('')
  const [lenderFilter, setLenderFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [minRate, setMinRate] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('mine')
  const [showInactive, setShowInactive] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addingPast, setAddingPast] = useState(false)
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null)
  const [dropCol, setDropCol] = useState<Column | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  function flashHint(text: string) { setHint(text); setTimeout(() => setHint((cur) => (cur === text ? null : cur)), 6000) }
  const [editing, setEditing] = useState<{ lead: Lead; markFileClosed: boolean } | null>(null)
  const nav = useNavigate()

  useEffect(() => {
    if (DEMO_MODE || !supabase) { setRows([]); return }
    ;(async () => {
      const { data: auth } = await supabase!.auth.getUser()
      if (!auth.user) { nav('/login'); return }
      const { data, error } = await supabase!.from('leads').select('*')
        .eq('wants_loan', true).is('archived_at', null).order('created_at', { ascending: false })
      if (error) setError(error.message)
      setRows((data as Lead[]) ?? [])
      const { data: members } = await supabase!.from('team_members').select('*').order('sort_order')
      setRoster((members as TeamMember[]) ?? [])
    })()
  }, [nav])

  const sorted = useMemo(() => {
    if (!rows) return null
    const list = [...rows]
    switch (sortMode) {
      case 'mine':
        // Her own drag-and-drop order; not-yet-placed clients on top by
        // follow-up date, so nothing new gets buried.
        list.sort((a, b) => {
          const pa = a.loan_board_position ?? null, pb = b.loan_board_position ?? null
          if (pa === null && pb === null) return (a.next_followup ?? '9999').localeCompare(b.next_followup ?? '9999')
            || b.created_at.localeCompare(a.created_at)
          if (pa === null) return -1
          if (pb === null) return 1
          return pa - pb
        })
        break
      case 'rate':
        list.sort((a, b) => (b.loan_closed_rate ?? -1) - (a.loan_closed_rate ?? -1))
        break
      case 'rate_low':
        // No rate yet sorts last, not first.
        list.sort((a, b) => (a.loan_closed_rate ?? 99) - (b.loan_closed_rate ?? 99))
        break
      case 'type':
        list.sort((a, b) => (loanTypeOf(a) ?? '~').localeCompare(loanTypeOf(b) ?? '~')
          || (b.loan_closed_rate ?? -1) - (a.loan_closed_rate ?? -1))
        break
      case 'name':
        list.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
        break
      case 'recent':
        list.sort((a, b) => b.created_at.localeCompare(a.created_at))
        break
      default:
        list.sort((a, b) => (a.next_followup ?? '9999').localeCompare(b.next_followup ?? '9999')
          || b.created_at.localeCompare(a.created_at))
    }
    return list
  }, [rows, sortMode])

  if (!rows || !sorted) return <div className="centered"><div className="spinner" /></div>

  // 083 adds the loan closing columns; without it the page still lists
  // clients and says what to run.
  const hasLoanCols = rows.length === 0 || 'loan_closed_rate' in rows[0]
  const hasFollowups = rows.length === 0 || 'next_followup' in rows[0]
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const isDue = (r: Lead) => Boolean(r.next_followup) && parseDate(r.next_followup!) <= today
  const memberName = (id: string | null) => roster.find((m) => m.id === id)?.full_name ?? null
  const needle = q.trim().toLowerCase()
  const digits = needle.replace(/\D/g, '')
  const rateFloor = minRate.trim() ? Number(minRate) : null

  const shown = sorted.filter((r) => {
    if (lenderFilter === 'none' ? r.lender_member_id : lenderFilter && r.lender_member_id !== lenderFilter) return false
    if (typeFilter && (typeFilter === 'none' ? loanTypeOf(r) : loanTypeOf(r) !== typeFilter)) return false
    if (!needle) return true
    return [r.full_name, r.full_name_2, r.email, r.loan_closed_lender, r.loan_closed_notes, r.followup_note]
      .some((f) => f?.toLowerCase().includes(needle))
      || (digits.length >= 3 && (r.phone ?? '').replace(/\D/g, '').includes(digits))
  })
  const inColumn = (c: Column) => shown.filter((r) => columnFor(r) === c
    && (c !== 'refi' || rateFloor === null || Number.isNaN(rateFloor) || (r.loan_closed_rate ?? 0) >= rateFloor))
  const inactive = shown.filter((r) => columnFor(r) === 'inactive')
  const loanTypes = [...new Set(rows.map(loanTypeOf).filter((t): t is string => !!t))].sort()
  const loanOfficers = roster.filter((m) => rows.some((r) => r.lender_member_id === m.id))

  async function patchRow(id: string, values: Partial<Lead>) {
    setError(null)
    setRows((cur) => cur?.map((r) => (r.id === id ? { ...r, ...values } : r)) ?? cur)
    if (DEMO_MODE || !supabase) return
    const { error } = await supabase.from('leads').update(values).eq('id', id)
    if (error) setError(error.message)
  }

  // 084 adds loan_board_position, her own order on this page.
  const hasOrder = rows.length === 0 || 'loan_board_position' in rows[0]
  const hasStage = rows.length === 0 || 'loan_stage' in rows[0]

  // Drop a card on another card in the same column: it goes just above or
  // below it. Worked out on the whole column as sorted (filtered-out clients
  // included), same as the Clients page. Dropping a Nurture client into Refi
  // plan opens "Loan closed…", since that column means the loan closed.
  async function placeCard(id: string, targetId: string | null, toCol: Column, after: boolean) {
    const moving = rows!.find((x) => x.id === id)
    if (!moving || id === targetId) return
    const fromCol = columnFor(moving)
    if (fromCol !== toCol) {
      if (toCol === 'refi' && (fromCol === 'nurture' || fromCol === 'inactive') && hasLoanCols) {
        setEditing({ lead: moving, markFileClosed: true })
      } else {
        flashHint(toCol === 'in_contract'
          ? 'In contract fills itself from the deal, so cards can\'t be dragged into it.'
          : 'That column follows the client\'s status, so cards can\'t be dragged there.')
      }
      return
    }
    if (!targetId) return
    if (!hasOrder) {
      flashHint('To save your own order here, run supabase/migrations/084_loan_board_order_and_stage.sql in Supabase\'s SQL Editor, then reload.')
      return
    }
    const col = sorted!.filter((x) => columnFor(x) === toCol && x.id !== id)
    const i = col.findIndex((x) => x.id === targetId) + (after ? 1 : 0)
    const prev = col[i - 1]?.loan_board_position ?? null, next = col[i]?.loan_board_position ?? null
    const usable = sortMode === 'mine' && (i === 0 || prev !== null) && (i === col.length || next !== null)
    if (usable) {
      const pos = prev === null ? (next ?? 0) - 1000 : next === null ? prev + 1000 : (prev + next) / 2
      patchRow(id, { loan_board_position: pos })
      return
    }
    // First arrangement (or another sort was showing): number the whole
    // column in the on-screen order, with the card dropped in.
    const order = [...col.slice(0, i), moving, ...col.slice(i)]
    const changes = order.map((x, n) => ({ x, pos: (n + 1) * 1000 }))
      .filter(({ x, pos }) => x.loan_board_position !== pos || x.id === id)
    setRows((cur) => cur?.map((r) => {
      const c = changes.find((ch) => ch.x.id === r.id)
      return c ? { ...r, loan_board_position: c.pos } : r
    }) ?? cur)
    setSortMode('mine')
    if (DEMO_MODE || !supabase) return
    setError(null)
    for (let k = 0; k < changes.length; k += 25) {
      const results = await Promise.all(changes.slice(k, k + 25).map(({ x, pos }) =>
        supabase!.from('leads').update({ loan_board_position: pos }).eq('id', x.id)))
      const bad = results.find((res) => res.error)
      if (bad?.error) { setError(bad.error.message); return }
    }
  }

  function cardDropHandlers(r: Lead) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes('text/client-id')) return
        e.preventDefault(); e.stopPropagation()
        const box = e.currentTarget.getBoundingClientRect()
        const after = e.clientY > box.top + box.height / 2
        setDropCol(null)
        setDropAt((cur) => (cur?.id === r.id && cur.after === after ? cur : { id: r.id, after }))
      },
      onDragLeave: () => setDropAt((cur) => (cur?.id === r.id ? null : cur)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation()
        const after = dropAt?.id === r.id ? dropAt.after : false
        setDropAt(null)
        const c = columnFor(r)
        placeCard(e.dataTransfer.getData('text/client-id'), r.id, c === 'inactive' ? 'nurture' : c, after)
      },
    }
  }

  function columnDropHandlers(c: Column) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes('text/client-id')) return
        e.preventDefault(); setDropCol(c)
      },
      onDragLeave: () => setDropCol((cur) => (cur === c ? null : cur)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault(); setDropCol(null)
        placeCard(e.dataTransfer.getData('text/client-id'), null, c, false)
      },
    }
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/l/${token}`)
    setCopied(token)
    setTimeout(() => setCopied(null), 1800)
  }

  function renderCard(r: Lead) {
    const col = columnFor(r)
    const due = isDue(r)
    const officer = memberName(r.lender_member_id)
    const loanType = loanTypeOf(r)
    const extra = col === 'refi'
      ? [{ label: r.loan_closed_rate != null || r.loan_closed_lender ? 'Edit loan details' : 'Add loan details',
           onClick: () => setEditing({ lead: r, markFileClosed: false }) }]
      : col === 'nurture' || col === 'inactive'
        ? [{ label: 'Loan closed…', onClick: () => setEditing({ lead: r, markFileClosed: true }) }]
        : []
    return (
      <div className={`clientcard${due ? ' due' : ''}${dropAt?.id === r.id ? (dropAt.after ? ' dropafter' : ' dropbefore') : ''}`}
           key={r.id} draggable
           onDragStart={(e) => { e.dataTransfer.setData('text/client-id', r.id); e.dataTransfer.effectAllowed = 'move' }}
           onDragEnd={() => { setDropAt(null); setDropCol(null) }}
           {...cardDropHandlers(r)}>
        <div className="clienttop">
          {/* Rate and loan type sit right beside the name. */}
          <span className="loannamewrap">
            <Link to={`/admin/leads/${r.id}`} className="clientname">
              {r.full_name || 'Unnamed client'}{r.full_name_2 ? ` & ${r.full_name_2}` : ''}
            </Link>
            {col === 'refi' ? (
              <span className="stagetag closed">Closed</span>
            ) : (() => {
              const stage = r.loan_stage ?? (col === 'in_contract' ? 'active' : 'shopping')
              return (
                <select className={`stagetag ${stage}`} value={stage} aria-label="Loan stage"
                        title="Where their loan is. Pick Closed when it funds."
                        onChange={(e) => {
                          const v = e.target.value
                          if (v === 'closed') { if (hasLoanCols) setEditing({ lead: r, markFileClosed: true }); return }
                          if (!hasStage) { flashHint('To save Active / Shopping, run supabase/migrations/084_loan_board_order_and_stage.sql in Supabase\'s SQL Editor, then reload.'); return }
                          patchRow(r.id, { loan_stage: v as 'active' | 'shopping' })
                        }}>
                  <option value="active">Active</option>
                  <option value="shopping">Shopping</option>
                  <option value="closed">Closed…</option>
                </select>
              )
            })()}
            {r.loan_closed_rate != null && (
              <button type="button" className="loantag rate" title="Interest rate they closed at. Click to edit"
                      onClick={() => setEditing({ lead: r, markFileClosed: false })}>{r.loan_closed_rate}%</button>
            )}
            {loanType && <span className="loantag" title="Loan type">{loanType}</span>}
          </span>
          {hasFollowups && (
            <FollowUpButton date={r.next_followup ?? null} note={r.followup_note ?? null} due={due}
                            overdue={due && parseDate(r.next_followup!) < today}
                            onSave={(date, note) => patchRow(r.id, { next_followup: date, followup_note: note })} />
          )}
          <CardMenu stage={null} onMove={() => {}} extra={hasLoanCols ? extra : []}
                    copied={copied === r.share_token} onCopy={() => copyLink(r.share_token)} onDelete={null} />
        </div>
        {col === 'refi' ? (
          <>
            <div className="clientmeta">
              {(() => {
                const closedOn = r.loan_closed_date || r.closed_date
                return [r.loan_closed_lender, closedOn ? `closed ${shortDate(closedOn)}` : null]
                  .filter(Boolean).join(' · ')
              })()}
            </div>
            {r.loan_closed_notes ? (
              <button type="button" className="clientnote linkish" title={r.loan_closed_notes}
                      onClick={() => setEditing({ lead: r, markFileClosed: false })}>{r.loan_closed_notes}</button>
            ) : r.loan_closed_rate == null && !r.loan_closed_lender && hasLoanCols ? (
              <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }}
                      onClick={() => setEditing({ lead: r, markFileClosed: false })}>+ Add lender, rate and notes</button>
            ) : null}
          </>
        ) : (
          <div className="clientmeta">
            {[officer ?? 'No loan officer', r.loan_status,
              r.estimated_loan_amount ? `$${Math.round(r.estimated_loan_amount / 1000)}k` : null,
              r.preapproval_on_file ? 'Pre-approved ✓' : null].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="admin">
      {DEMO_MODE && (
        <div className="demobar">Demo data — no database connected yet. Nothing you change here is saved.</div>
      )}
      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 17.5 }}>Loan Clients</span>
        <nav className="adminnav">
          <button className="btn primary" onClick={() => setAddingPast(true)}>+ Add past client</button>
        </nav>
      </header>
      <AdminNav current="loans" />

      {addingPast && (
        <PastClientForm roster={roster} onCancel={() => setAddingPast(false)}
                        onCreated={async (newId) => {
                          // Stay here so several past clients can go in one after another.
                          setAddingPast(false)
                          if (!supabase) return
                          const { data } = await supabase.from('leads').select('*').eq('id', newId).single()
                          if (data) setRows((cur) => [data as Lead, ...(cur ?? [])])
                        }} />
      )}
      {editing && (
        <LoanClosedDialog
          leadId={editing.lead.id}
          name={editing.lead.full_name || 'This client'}
          markFileClosed={editing.markFileClosed}
          initial={{
            loan_closed_date: editing.lead.loan_closed_date ?? editing.lead.closed_date ?? null,
            loan_closed_lender: editing.lead.loan_closed_lender ?? null,
            loan_closed_rate: editing.lead.loan_closed_rate ?? null,
            loan_closed_notes: editing.lead.loan_closed_notes ?? null,
          }}
          onClose={(saved: (LoanClosedValues & Partial<Lead>) | null) => {
            const id = editing.lead.id
            const closing = editing.markFileClosed
            setEditing(null)
            if (saved) setRows((cur) => cur?.map((r) => (r.id === id ? { ...r, ...saved } : r)) ?? cur)
            // Newly closed: top of Refi plan, where she can drag it from.
            if (saved && closing && hasOrder) patchRow(id, { loan_board_position: null })
          }} />
      )}

      {rows.length > 0 && (
        <div className="clienttools">
          <input className="clientsearch" value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder={`Search ${rows.length} loan clients by name, phone, lender or note…`} />
          <select value={lenderFilter} onChange={(e) => setLenderFilter(e.target.value)} aria-label="Loan officer">
            <option value="">All loan officers</option>
            {loanOfficers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            <option value="none">No loan officer yet</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Loan type">
            <option value="">All loan types</option>
            {loanTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value="none">No loan type yet</option>
          </select>
          {hasLoanCols && (
            <label className="clientcheck" title="Refi plan shows only loans at or above this rate">
              Refi rate at least
              <input value={minRate} onChange={(e) => setMinRate(e.target.value)} inputMode="decimal"
                     placeholder="any" style={{ width: 64, padding: '6px 8px', fontSize: 15 }} />%
            </label>
          )}
          <label className="clientsort">Sort by
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
              <option value="mine">My order</option>
              <option value="followup">Next follow-up</option>
              <option value="rate">Rate (highest first)</option>
              <option value="rate_low">Rate (lowest first)</option>
              <option value="type">Loan type</option>
              <option value="name">Name (A–Z)</option>
              <option value="recent">Recently added</option>
            </select>
          </label>
        </div>
      )}

      {!hasLoanCols && (
        <p className="sethelp" style={{ margin: '0 24px 14px', color: 'var(--danger)', fontWeight: 600, overflowWrap: 'anywhere' }}>
          One database step turns on lender, rate and refi notes: in Supabase's SQL Editor, run
          supabase/migrations/083_loan_closing_details.sql, then reload this page.
        </p>
      )}
      {hint && (
        <p className="sethelp" style={{ margin: '0 24px 14px', fontWeight: 600, color: 'var(--ink-dim)', overflowWrap: 'anywhere' }}>{hint}</p>
      )}
      {error && (
        <p className="sethelp" style={{ margin: '0 24px 14px', color: 'var(--danger)', fontWeight: 600 }}>
          That change didn't save: {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="centered">
          <p className="muted" style={{ maxWidth: 380, lineHeight: 1.7 }}>
            No loan clients yet. On a client's file, tick "Loan" under "What do they need?" and they'll show up here.
          </p>
        </div>
      ) : (
        <>
          <div className="clientboard">
            {COLUMNS.map((c) => {
              const list = inColumn(c.key)
              return (
                <section key={c.key} className={`clientcol${dropCol === c.key ? ' dropping' : ''}`}
                         style={{ borderTopColor: c.color }} {...columnDropHandlers(c.key)}>
                  <h2 className="clientcolhdr">{c.label} <span className="clientcount">{list.length}</span></h2>
                  <p className="clientcolhelp">{c.help}</p>
                  <div className="clientcolbody">
                    {list.length === 0 && <p className="muted" style={{ fontSize: 14.5, margin: '6px 2px' }}>
                      {needle || lenderFilter || typeFilter || (c.key === 'refi' && minRate) ? 'No matches here.' : 'No one here right now.'}</p>}
                    {list.map(renderCard)}
                  </div>
                </section>
              )
            })}
          </div>
          {inactive.length > 0 && (
            <div style={{ padding: '18px 24px 0' }}>
              <button type="button" className="btn" onClick={() => setShowInactive((v) => !v)}>
                {showInactive ? 'Hide inactive' : `Inactive (${inactive.length})`}
              </button>
              {showInactive && <div className="clientinactive">{inactive.map(renderCard)}</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
