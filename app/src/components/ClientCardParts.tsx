// Pieces shared by the Clients and Loan Clients pages: the follow-up button,
// the "⋯" card menu, star initials, and local-date parsing.
import { useEffect, useState } from 'react'

/** YYYY-MM-DD as local midnight (never `new Date('2026-07-26')`, which is UTC). */
export function parseDate(d: string) { const [y, m, day] = d.split('-').map(Number); return new Date(y, m - 1, day) }

// "⋯" on each card: move to a stage (phones can't drag), copy link, delete.
// Kept off the card itself so 600 clients fit on screen.
export function CardMenu({ stage, onMove, copied, onCopy, onDelete, extra = [] }: {
  stage: string | null; onMove: (stage: string) => void
  copied: boolean; onCopy: () => void; onDelete: (() => void) | null
  /** Page-specific actions, listed first (e.g. the Loan Clients page's loan details). */
  extra?: { label: string; onClick: () => void }[]
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useEffect(() => {
    if (!pos) return
    const close = (e: Event) => {
      if (e.target instanceof Node && document.querySelector('.cardmenu')?.contains(e.target)) return
      setPos(null)
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('mousedown', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('mousedown', close)
    }
  }, [pos])
  function toggle(btn: HTMLElement) {
    if (pos) { setPos(null); return }
    const r = btn.getBoundingClientRect()
    const top = r.bottom + 4 + 220 > window.innerHeight ? Math.max(8, r.top - 224) : r.bottom + 4
    setPos({ top, left: Math.max(8, Math.min(r.right - 200, window.innerWidth - 208)) })
  }
  const stages: [string, string][] = [['active', 'Upcoming'], ['nurture', 'Nurture'], ['inactive', 'Inactive']]
  return (
    <>
      <button type="button" className="cardmenubtn" aria-label="More" title="Move, copy link, delete"
              onMouseDown={(e) => e.stopPropagation()} onClick={(e) => toggle(e.currentTarget)}>⋯</button>
      {pos && (
        <div className="cardmenu" style={pos} onKeyDown={(e) => { if (e.key === 'Escape') setPos(null) }}>
          {extra.length > 0 && <>
            {extra.map((x) => (
              <button key={x.label} type="button" onClick={() => { setPos(null); x.onClick() }}>{x.label}</button>
            ))}
            <hr />
          </>}
          {stage && <>
            <div className="cardmenuhdr">Move to</div>
            {stages.map(([v, label]) => (
              <button key={v} type="button" disabled={v === stage}
                      onClick={() => { onMove(v); setPos(null) }}>{v === stage ? `✓ ${label}` : label}</button>
            ))}
            <hr />
          </>}
          <button type="button" onClick={() => { onCopy(); setTimeout(() => setPos(null), 900) }}>
            {copied ? 'Copied ✓' : 'Copy client link'}
          </button>
          {onDelete && <button type="button" className="danger" onClick={() => { setPos(null); onDelete() }}>Delete file</button>}
        </div>
      )}
    </>
  )
}

export type Star = { profile_id: string; author_name: string | null }

export function initials(name: string | null) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '•'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
      <rect x="1.5" y="2.5" width="13" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M1.5 6.5h13M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export function FollowUpButton({ date, note, due, overdue, onSave }: {
  date: string | null; note: string | null; due: boolean; overdue: boolean
  onSave: (date: string | null, note: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [d, setD] = useState(date ?? '')
  const [n, setN] = useState(note ?? '')
  // Placed on the page itself (not inside the card), so a scrolling column
  // can't cut the box off. Scrolling closes it rather than leaving it adrift.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  function start(btn: HTMLElement) {
    const r = btn.getBoundingClientRect()
    const top = r.bottom + 6 + 260 > window.innerHeight ? Math.max(8, r.top - 266) : r.bottom + 6
    setPos({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - 296)) })
    setD(date ?? ''); setN(note ?? ''); setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => { if (!(e.target instanceof Node && document.querySelector('.followpop')?.contains(e.target))) setOpen(false) }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [open])
  // Kept short so the client's name has room: a calendar and the date.
  const label = date ? (due && !overdue ? 'Today' : parseDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : '+'
  const hint = date
    ? `${overdue ? 'Overdue follow-up' : due ? 'Follow-up due today' : 'Next follow-up'}${note ? `: ${note}` : ''}`
    : 'Schedule a follow-up'
  return (
    <div className="followwrap">
      <button type="button" className={`followbtn${due ? ' due' : ''}${overdue ? ' overdue' : ''}${date ? ' set' : ''}`}
              onClick={(e) => (open ? setOpen(false) : start(e.currentTarget))} aria-expanded={open}
              title={hint} aria-label={hint}>
        <CalendarIcon />{label}
      </button>
      {open && (
        <div className="followpop" style={pos ?? undefined} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}>
          <label>When
            <input type="date" value={d} autoFocus onChange={(e) => setD(e.target.value)} />
          </label>
          <label>What for? <span className="muted">(just for you)</span>
            <textarea rows={2} value={n} onChange={(e) => setN(e.target.value)} placeholder="e.g. check on pre-approval" />
          </label>
          <div className="followpopacts">
            <button type="button" className="btn primary" disabled={!d}
                    onClick={() => { onSave(d || null, n.trim() || null); setOpen(false) }}>Save</button>
            {date && (
              <button type="button" className="btn" title="Followed up. Clear this one."
                      onClick={() => { onSave(null, null); setOpen(false) }}>Mark done</button>
            )}
            <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
