// "+ Add past client" on Loan Clients (Allison, 2026-10-01): a client whose
// loan already closed before they were in the app. Creates their file as
// Closed with the loan details filled in, so they land straight in Refi plan
// and can be tracked from there. Checks for an existing file first, same as
// New client on the Clients page.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import { LOAN_TYPES, type LoanType, type TeamMember } from '../lib/types'

export default function PastClientForm({ roster, onCancel, onCreated }: {
  roster: TeamMember[]; onCancel: () => void; onCreated: (id: string) => void
}) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [loanType, setLoanType] = useState<LoanType | ''>('')
  const [rate, setRate] = useState('')
  const [lender, setLender] = useState('')
  const [closedOn, setClosedOn] = useState('')
  const [officer, setOfficer] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dupes, setDupes] = useState<{ id: string; full_name: string }[] | null>(null)

  // One entry per name, people tagged as lenders first.
  const seen = new Set<string>()
  const officers = [...roster].sort((a, b) => Number(isLender(b)) - Number(isLender(a)))
    .filter((m) => { const k = (m.full_name || '').trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true })

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setErr('Add their name.'); return }
    const rateNum = rate.trim() ? Number(rate.replace('%', '').trim()) : null
    if (rateNum !== null && (Number.isNaN(rateNum) || rateNum <= 0 || rateNum > 25)) { setErr('The interest rate should be a number like 6.875.'); return }
    if (DEMO_MODE || !supabase) { setErr('There’s no database connected yet, so this can’t save.'); return }
    setBusy(true); setErr(null)

    const { data: me } = await supabase.from('profiles')
      .select('team_id').eq('id', (await supabase.auth.getUser()).data.user?.id ?? '').single()
    if (!me?.team_id) { setErr('Couldn’t work out which team you’re on.'); setBusy(false); return }

    if (!dupes) {
      const { data: existing } = await supabase.from('leads').select('id, full_name, phone, email').eq('team_id', me.team_id)
      const name = fullName.trim().toLowerCase(), ph = phone.replace(/\D/g, ''), em = email.trim().toLowerCase()
      const hits = ((existing ?? []) as { id: string; full_name: string | null; phone: string | null; email: string | null }[])
        .filter((l) => (l.full_name ?? '').trim().toLowerCase() === name
          || (ph.length >= 7 && (l.phone ?? '').replace(/\D/g, '') === ph)
          || (em && (l.email ?? '').trim().toLowerCase() === em))
        .map((l) => ({ id: l.id, full_name: l.full_name || 'Unnamed client' }))
      if (hits.length) { setDupes(hits); setBusy(false); return }
    }

    const t = new Date()
    const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    const { data: lead, error } = await supabase.from('leads').insert({
      team_id: me.team_id,
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      wants_buying: false,
      wants_loan: true,
      loan_type: loanType || null,
      lender_member_id: officer || null,
      lead_status: 'closed',
      closed_date: closedOn || today,
      loan_closed_date: closedOn || today,
      loan_closed_rate: rateNum,
      loan_closed_lender: lender.trim() || null,
      loan_closed_notes: notes.trim() || null,
    }).select('id').single()
    setBusy(false)
    if (error || !lead) {
      setErr(error && /loan_closed/.test(error.message)
        ? 'One database step is needed first: run supabase/migrations/083_loan_closing_details.sql in Supabase\'s SQL Editor, then try again.'
        : `Couldn't save: ${error?.message ?? 'unknown problem'}`)
      return
    }
    onCreated(lead.id)
  }

  return (
    <div className="modalback" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <form className="modalcard" onSubmit={create} onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onCancel() }}>
        <h2 style={{ margin: 0, fontSize: 21 }}>Add a past client</h2>
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>
          Someone whose loan already closed. They go straight into <strong>Refi plan</strong>.
        </p>
        {dupes && (
          <div style={{ border: '1px solid var(--danger)', background: '#FBEDEA', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
            <strong style={{ color: 'var(--danger)' }}>This client may already have a file:</strong>
            <ul style={{ margin: '6px 0', paddingLeft: 20 }}>
              {dupes.map((d) => <li key={d.id}><Link to={`/admin/leads/${d.id}`}>{d.full_name}</Link></li>)}
            </ul>
            <span className="muted" style={{ fontSize: 14.5 }}>
              Open their file to close it there, or press <strong>Add anyway</strong> if this is someone else.
            </span>
          </div>
        )}
        <label>Name<input value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus placeholder="Their full name" /></label>
        <div className="modalrow">
          <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></label>
          <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" /></label>
        </div>
        <div className="modalrow">
          <label>Loan type
            <select value={loanType} onChange={(e) => setLoanType(e.target.value as LoanType | '')}>
              <option value="">Not sure</option>
              {LOAN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label style={{ maxWidth: 140 }}>Interest rate
            <span className="ratebox"><input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="6.875" /><span>%</span></span>
          </label>
        </div>
        <div className="modalrow">
          <label>Lender<input value={lender} onChange={(e) => setLender(e.target.value)} placeholder="e.g. UWM" /></label>
          <label>Closing date<input type="date" value={closedOn} onChange={(e) => setClosedOn(e.target.value)} /></label>
        </div>
        <label>Loan officer
          <select value={officer} onChange={(e) => setOfficer(e.target.value)}>
            <option value="">Not set</option>
            {officers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </label>
        <label>Notes of interest
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Refi when rates hit 6%. Wants cash out for a pool." />
        </label>
        {err && <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 600, overflowWrap: 'anywhere' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : dupes ? 'Add anyway' : 'Add past client'}</button>
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  )
}

function isLender(m: TeamMember) {
  return m.roles.includes('loan_officer') || m.roles.includes('mortgage_broker')
}
