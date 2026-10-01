// "This loan closed" pop-up: lender, interest rate, closing date and notes
// for a future refinance. Shown right after a loan client's deal is marked
// Closed & Funded, and from the Loan Clients page. Saves onto the client's
// file (migration 083); the client then shows under "Refi plan".
import { useEffect, useState } from 'react'
import { DEMO_MODE, supabase } from '../lib/supabase'

export interface LoanClosedValues {
  loan_closed_date: string | null
  loan_closed_lender: string | null
  loan_closed_rate: number | null
  loan_closed_notes: string | null
}

export default function LoanClosedDialog({ leadId, name, initial, markFileClosed = false, onClose }: {
  leadId: string
  name: string
  initial: Partial<LoanClosedValues>
  /** Also move the client file to Closed (a loan-only client with no deal). */
  markFileClosed?: boolean
  onClose: (saved: (LoanClosedValues & { lead_status?: 'closed'; closed_date?: string }) | null) => void
}) {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const [date, setDate] = useState(initial.loan_closed_date ?? todayStr)
  const [lender, setLender] = useState(initial.loan_closed_lender ?? '')
  const [rate, setRate] = useState(initial.loan_closed_rate != null ? String(initial.loan_closed_rate) : '')
  const [notes, setNotes] = useState(initial.loan_closed_notes ?? '')
  const [lenders, setLenders] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Lenders she's typed before, offered as she types.
  useEffect(() => {
    if (DEMO_MODE || !supabase) return
    supabase.from('leads').select('loan_closed_lender').not('loan_closed_lender', 'is', null).limit(1000)
      .then(({ data }) => {
        const names = new Set(((data ?? []) as { loan_closed_lender: string }[]).map((r) => r.loan_closed_lender.trim()).filter(Boolean))
        setLenders([...names].sort((a, b) => a.localeCompare(b)))
      })
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const rateNum = rate.trim() ? Number(rate.replace('%', '').trim()) : null
    if (rateNum !== null && (Number.isNaN(rateNum) || rateNum <= 0 || rateNum > 25)) {
      setErr('The interest rate should be a number like 6.875.'); return
    }
    const values: LoanClosedValues & { lead_status?: 'closed'; closed_date?: string } = {
      loan_closed_date: date || null,
      loan_closed_lender: lender.trim() || null,
      loan_closed_rate: rateNum,
      loan_closed_notes: notes.trim() || null,
      ...(markFileClosed ? { lead_status: 'closed' as const, closed_date: date || todayStr } : {}),
    }
    if (DEMO_MODE || !supabase) { onClose(values); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.from('leads').update(values).eq('id', leadId)
    setBusy(false)
    if (error) {
      setErr(/loan_closed/.test(error.message)
        ? 'One database step is needed first: run supabase/migrations/083_loan_closing_details.sql in Supabase\'s SQL Editor, then try again.'
        : `Couldn't save: ${error.message}`)
      return
    }
    onClose(values)
  }

  return (
    <div className="modalback" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(null) }}>
      <form className="modalcard" onSubmit={save} onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onClose(null) }}>
        <h2 style={{ margin: 0, fontSize: 21 }}>🎉 {name}'s loan closed</h2>
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>
          Save the details for a future refinance. They'll show under <strong>Refi plan</strong> on Loan Clients.
        </p>
        <div className="modalrow">
          <label>Lender
            <input value={lender} onChange={(e) => setLender(e.target.value)} list="loan-closed-lenders"
                   placeholder="e.g. UWM" autoFocus />
            <datalist id="loan-closed-lenders">{lenders.map((l) => <option key={l} value={l} />)}</datalist>
          </label>
          <label style={{ maxWidth: 140 }}>Interest rate
            <span className="ratebox">
              <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="6.875" />
              <span>%</span>
            </span>
          </label>
        </div>
        <label>Closing date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200 }} />
        </label>
        <label>Notes of interest
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Refi when rates hit 6%. Wants cash out for a pool. ARM adjusts in 2031." />
        </label>
        {err && <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 600, overflowWrap: 'anywhere' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => onClose(null)}>Skip for now</button>
        </div>
      </form>
    </div>
  )
}
