import { useMemo, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import AdminNav from '../components/AdminNav'
import { useIsDatabaseManager } from '../lib/useIsDatabaseManager'
import './Admin.css'

interface Row {
  key: string
  kind: 'contact' | 'lead' | 'saved'
  id: string
  name: string
  phone: string | null
  email: string | null
  roleLabel: string
  context: string
  href: string | null
  /** Buyers/Sellers on a transaction, or an Active Client lead — someone
   *  with an actual client profile to click through to, as opposed to an
   *  agent, lender, title company, or other non-client contact. */
  isClient: boolean
  /** Set when this row traces back to a closed lead — shows the
   *  "Client returning to active" button, since that's the only state
   *  where reactivating actually makes sense. */
  closedLeadId?: string
}

/**
 * "Virtual rolodex" — two lists side by side:
 *
 *  Clients               Buyers/Sellers on a transaction, plus every Active
 *                         Client. Only visible here to whoever's actually
 *                         attached to that deal — same rule the transaction
 *                         itself enforces (see migration 060).
 *  Professional Contacts  Agents, lenders, vendors — pulled from every
 *                         transaction's contacts PLUS the team's saved
 *                         contacts list, which anyone can add straight to
 *                         and everyone on the team can see, deal or no deal.
 *
 * RLS already decides what comes back for whoever's signed in — this page
 * just renders whatever it gets.
 */
export default function AdminRolodex() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [dupesOnly, setDupesOnly] = useState(false)
  const [reactivatingId, setReactivatingId] = useState<string | null>(null)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [addingContact, setAddingContact] = useState(false)
  const nav = useNavigate()
  const isDatabaseManager = useIsDatabaseManager()

  async function load() {
    if (DEMO_MODE || !supabase) { setRows([]); return }

    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { nav('/login'); return }

    const { data: me } = await supabase.from('profiles')
      .select('team_id').eq('id', auth.user.id).single()
    setTeamId(me?.team_id ?? null)

    const { data: contactRows } = await supabase
      .from('contacts')
      .select('id, name, phone, email, role_label, transaction_id, transactions(address_line, city_state_zip)')
      .eq('group_key', 'people')
      .not('name', 'is', null)
      .neq('name', '')

    // Once a lead converts, their Buyers/Sellers contact card on the
    // transaction is the canonical entry for this person — leaving the
    // lead in here too (it stays visible on purpose, see Active Buyers/
    // Closed) would flag every single converted client as a "duplicate"
    // of themselves forever.
    const { data: leadRows } = await supabase
      .from('leads')
      .select('id, full_name, phone, email')
      .is('archived_at', null)
      .is('converted_transaction_id', null)

    const { data: savedRows } = await supabase
      .from('saved_contacts')
      .select('id, name, phone, email, role_label')

    // Traces each transaction contact back to a closed lead (if any), so
    // "Reactivate for a new deal" can show up right on that contact's row —
    // a lead's whole history lives in lead_transactions now, not just its
    // current transaction.
    const { data: historyRows } = await supabase
      .from('lead_transactions')
      .select('transaction_id, leads(id, lead_status)')
    const closedLeadByTx = new Map<string, string>()
    for (const h of (historyRows ?? []) as unknown as Array<{
      transaction_id: string; leads: { id: string; lead_status: string } | null
    }>) {
      if (h.leads?.lead_status === 'closed') closedLeadByTx.set(h.transaction_id, h.leads.id)
    }

    const fromContacts: Row[] = ((contactRows ?? []) as unknown as Array<{
      id: string; name: string; phone: string | null; email: string | null
      role_label: string; transaction_id: string
      transactions: { address_line: string; city_state_zip: string } | null
    }>).map((c) => ({
      key: `c-${c.id}`,
      kind: 'contact',
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      roleLabel: c.role_label,
      context: c.transactions?.address_line || 'Untitled transaction',
      href: `/admin/t/${c.transaction_id}`,
      isClient: c.role_label === 'Buyers' || c.role_label === 'Sellers',
      closedLeadId: closedLeadByTx.get(c.transaction_id),
    }))

    const fromLeads: Row[] = ((leadRows ?? []) as Array<{
      id: string; full_name: string; phone: string | null; email: string | null
    }>).filter((l) => l.full_name?.trim()).map((l) => ({
      key: `l-${l.id}`,
      kind: 'lead',
      id: l.id,
      name: l.full_name,
      phone: l.phone,
      email: l.email,
      roleLabel: 'Active client',
      context: 'Active Clients',
      href: `/admin/leads/${l.id}`,
      isClient: true,
    }))

    const fromSaved: Row[] = ((savedRows ?? []) as Array<{
      id: string; name: string; phone: string | null; email: string | null; role_label: string
    }>).map((s) => ({
      key: `s-${s.id}`,
      kind: 'saved',
      id: s.id,
      name: s.name,
      phone: s.phone,
      email: s.email,
      roleLabel: s.role_label,
      context: 'Saved contact',
      href: null,
      isClient: false,
    }))

    setRows([...fromContacts, ...fromLeads, ...fromSaved])
  }

  useEffect(() => { load() }, [nav])

  async function reactivate(r: Row) {
    if (!r.closedLeadId || !supabase || reactivatingId) return
    if (!confirm(`Reactivate ${r.name} for a new deal? Their past transaction history stays on file.`)) return
    setReactivatingId(r.key)
    const { error } = await supabase.rpc('reactivate_lead', { p_lead_id: r.closedLeadId })
    setReactivatingId(null)
    if (error) { alert(error.message); return }
    nav(`/admin/leads/${r.closedLeadId}`)
  }

  async function deleteRow(r: Row) {
    if (!supabase || deletingKey) return
    const confirmMsg = r.kind === 'lead'
      ? `Permanently delete "${r.name || 'this client'}"? This can't be undone — appointments, homes, notes, and everything else on their file goes with it.`
      : `Remove "${r.name || 'this contact'}"? This can't be undone.`
    if (!confirm(confirmMsg)) return
    setDeletingKey(r.key)
    const table = r.kind === 'lead' ? 'leads' : r.kind === 'saved' ? 'saved_contacts' : 'contacts'
    const { error } = await supabase.from(table).delete().eq('id', r.id)
    setDeletingKey(null)
    if (error) { alert(`Couldn't delete it: ${error.message}`); return }
    setRows((cur) => cur?.filter((x) => x.key !== r.key) ?? cur)
  }

  async function addSavedContact(values: { name: string; roleLabel: string; phone: string; email: string }) {
    if (!supabase || !teamId) return
    const { data, error } = await supabase.from('saved_contacts')
      .insert({
        team_id: teamId, group_key: 'people',
        role_label: values.roleLabel.trim() || 'Contact',
        name: values.name.trim(), phone: values.phone.trim() || null, email: values.email.trim() || null,
      })
      .select('id, name, phone, email, role_label').single()
    if (error || !data) { alert(error?.message ?? 'Could not add that contact.'); return }
    setRows((cur) => [...(cur ?? []), {
      key: `s-${data.id}`, kind: 'saved', id: data.id,
      name: data.name, phone: data.phone, email: data.email,
      roleLabel: data.role_label, context: 'Saved contact', href: null, isClient: false,
    }])
    setAddingContact(false)
  }

  const dupeKeys = useMemo(() => {
    if (!rows) return new Set<string>()
    const seen = new Map<string, number>()
    for (const r of rows) {
      for (const k of [normPhone(r.phone), normEmail(r.email)]) {
        if (!k) continue
        seen.set(k, (seen.get(k) ?? 0) + 1)
      }
    }
    const dupes = new Set<string>()
    for (const r of rows) {
      for (const k of [normPhone(r.phone), normEmail(r.email)]) {
        if (k && (seen.get(k) ?? 0) > 1) dupes.add(r.key)
      }
    }
    return dupes
  }, [rows])

  if (!rows) return <div className="centered"><div className="spinner" /></div>

  function matches(r: Row) {
    if (dupesOnly && !dupeKeys.has(r.key)) return false
    if (!q.trim()) return true
    const needle = q.trim().toLowerCase()
    return r.name.toLowerCase().includes(needle)
      || r.email?.toLowerCase().includes(needle)
      || r.phone?.toLowerCase().includes(needle)
  }

  const clientRows = rows.filter((r) => r.isClient).filter(matches).sort((a, b) => a.name.localeCompare(b.name))
  const professionalRows = rows.filter((r) => !r.isClient).filter(matches).sort((a, b) => a.name.localeCompare(b.name))

  function renderRow(r: Row) {
    return (
      <div className="note" key={r.key}>
        <div className="notemeta">
          <span className="noteauthor">
            {r.isClient && r.href ? <Link to={r.href}>{r.name}</Link> : r.name}
          </span>
          <span className="notewhen">{r.roleLabel}</span>
          {dupeKeys.has(r.key) && (
            <span className="notewhen" style={{ color: 'var(--danger)' }}>Possible duplicate</span>
          )}
        </div>
        <p className="notebody" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>
            {[r.phone, r.email].filter(Boolean).join(' · ') || <span className="muted">No contact info</span>}
            {r.href && <>{' — '}<Link to={r.href}>{r.context}</Link></>}
          </span>
          {r.closedLeadId && (
            <button type="button" className="btn" style={{ flex: 'none' }}
                    disabled={reactivatingId === r.key}
                    onClick={() => reactivate(r)}>
              {reactivatingId === r.key ? 'Reactivating…' : 'Reactivate for a new deal →'}
            </button>
          )}
          {isDatabaseManager && (
            <button type="button" className="btn"
                    style={{ flex: 'none', marginLeft: 'auto', color: 'var(--danger, #cc3311)' }}
                    disabled={deletingKey === r.key}
                    onClick={() => deleteRow(r)}
                    title={r.kind === 'lead' ? 'Permanently delete this file' : 'Remove this contact'}>
              {deletingKey === r.key ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="admin">
      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 15 }}>Rolodex</span>
      </header>
      <AdminNav current="rolodex" />

      <div className="card setcard">
        <div className="field2">
          <div className="field">
            <label>Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Name, phone, or email" />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <div className="checkline" style={{ margin: 0 }}>
              <input type="checkbox" checked={dupesOnly} onChange={(e) => setDupesOnly(e.target.checked)} />
              <span className="cl">Show only likely duplicates ({dupeKeys.size})</span>
            </div>
          </div>
        </div>
      </div>

      <div className="settings" style={{ marginTop: 18 }}>
        <div className="card setcard">
          <h2>Clients</h2>
          <p className="sethelp">
            Client info is only saved into the Rolodex of team members added to that
            client's profile.
          </p>
          {clientRows.length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5 }}>Nothing matches.</p>
          ) : (
            <div className="notelist" style={{ marginTop: 10 }}>
              {clientRows.map(renderRow)}
            </div>
          )}
        </div>

        <div className="card setcard">
          <h2>Professional Contacts</h2>
          <p className="sethelp">
            Professional contacts save for all user access — visible to the whole team,
            no matter who's on which deal.
          </p>
          {professionalRows.length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5 }}>Nothing matches.</p>
          ) : (
            <div className="notelist" style={{ marginTop: 10 }}>
              {professionalRows.map(renderRow)}
            </div>
          )}
          {addingContact ? (
            <AddContactForm onCancel={() => setAddingContact(false)} onSave={addSavedContact} />
          ) : (
            <div className="savebar">
              <button type="button" className="btn" onClick={() => setAddingContact(true)}>
                + Add contact
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AddContactForm({ onCancel, onSave }: {
  onCancel: () => void
  onSave: (values: { name: string; roleLabel: string; phone: string; email: string }) => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [roleLabel, setRoleLabel] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    await onSave({ name, roleLabel, phone, email })
    setBusy(false)
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 10 }}>
      <div className="field2">
        <div className="field">
          <label>Name</label>
          <input value={name} autoFocus required onChange={(e) => setName(e.target.value)}
                 placeholder="Jordan Reyes" />
        </div>
        <div className="field">
          <label>Category</label>
          <input value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)}
                 placeholder="Title Company, Inspector, Lender…" />
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
      <div className="savebar">
        <button className="btn primary" disabled={busy}>{busy ? 'Adding…' : 'Add contact'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function normPhone(p: string | null): string | null {
  if (!p) return null
  const digits = p.replace(/\D/g, '')
  return digits.length >= 7 ? digits : null
}

function normEmail(e: string | null): string | null {
  if (!e) return null
  const t = e.trim().toLowerCase()
  return t || null
}
