import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import AdminNav from '../components/AdminNav'
import { useIsDatabaseManager } from '../lib/useIsDatabaseManager'
import './Admin.css'

interface Row {
  key: string
  kind: 'contact' | 'lead' | 'saved' | 'folder'
  id: string
  name: string
  phone: string | null
  email: string | null
  roleLabel: string
  context: string
  href: string | null
  address?: string | null
  businessName?: string | null
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
 *                         transaction's contacts, the team's saved contacts
 *                         list (visible to everyone, deal or no deal), and
 *                         every Home Page folder's contacts list. That last
 *                         source relies entirely on `resource_folder_contacts`'
 *                         own RLS (`can_access_resource_folder`) to decide who
 *                         sees what — a person only sees a folder contact here
 *                         if they can already see that folder on the Home
 *                         Page, so a grant on the folder is all it takes.
 *
 * RLS already decides what comes back for whoever's signed in — this page
 * just renders whatever it gets.
 */
export default function AdminRolodex() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [teamId, setTeamId] = useState<string | null>(null)
  // ?q= comes from a name picked in the side menu's Rolodex list.
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  useEffect(() => { const v = params.get('q'); if (v !== null) setQ(v) }, [params])
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
      .select('id, name, phone, email, role_label, address, business_name')

    // RLS on resource_folder_contacts already restricts this to folders the
    // signed-in person can access — no team-wide visibility here, unlike
    // saved_contacts above.
    const { data: folderContactRows } = await supabase
      .from('resource_folder_contacts')
      .select('id, name, phone, email, role_label, note, folder_id, resource_folders(name)')
      .not('name', 'is', null)
      .neq('name', '')

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
      roleLabel: 'Client',
      context: 'Clients',
      href: `/admin/leads/${l.id}`,
      isClient: true,
    }))

    const fromSaved: Row[] = ((savedRows ?? []) as Array<{
      id: string; name: string; phone: string | null; email: string | null; role_label: string
      address: string | null; business_name: string | null
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
      address: s.address,
      businessName: s.business_name,
    }))

    const fromFolderContacts: Row[] = ((folderContactRows ?? []) as unknown as Array<{
      id: string; name: string; phone: string | null; email: string | null
      role_label: string | null; note: string | null; folder_id: string
      resource_folders: { name: string } | null
    }>).filter((c) => c.name?.trim()).map((c) => ({
      key: `fc-${c.id}`,
      kind: 'folder',
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      roleLabel: c.role_label || 'Contact',
      context: c.resource_folders ? `Resource Library — ${c.resource_folders.name}` : 'Resource Library',
      href: '/admin/resources',
      isClient: false,
    }))

    setRows([...fromContacts, ...fromLeads, ...fromSaved, ...fromFolderContacts])
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
    const table = r.kind === 'lead' ? 'leads'
      : r.kind === 'saved' ? 'saved_contacts'
      : r.kind === 'folder' ? 'resource_folder_contacts'
      : 'contacts'
    const { error } = await supabase.from(table).delete().eq('id', r.id)
    setDeletingKey(null)
    if (error) { alert(`Couldn't delete it: ${error.message}`); return }
    setRows((cur) => cur?.filter((x) => x.key !== r.key) ?? cur)
  }

  async function addSavedContact(values: { name: string; businessName: string; roleLabel: string; phone: string; email: string; address: string }) {
    if (!supabase || !teamId) return
    const { data, error } = await supabase.from('saved_contacts')
      .insert({
        team_id: teamId, group_key: 'people',
        role_label: values.roleLabel.trim() || 'Contact',
        name: values.name.trim(), phone: values.phone.trim() || null, email: values.email.trim() || null,
        address: values.address.trim() || null, business_name: values.businessName.trim() || null,
      })
      .select('id, name, phone, email, role_label, address, business_name').single()
    if (error || !data) { alert(error?.message ?? 'Could not add that contact.'); return }
    setRows((cur) => [...(cur ?? []), {
      key: `s-${data.id}`, kind: 'saved', id: data.id,
      name: data.name, phone: data.phone, email: data.email,
      roleLabel: data.role_label, context: 'Saved contact', href: null, isClient: false,
      address: data.address, businessName: data.business_name,
    }])
    setAddingContact(false)
  }

  // One entry per person. The same client is a separate row on every deal
  // they've been on (plus their saved contact, etc.), which listed Heather
  // Smith twice. Rows with the same name and a matching phone or email (or
  // no phone/email at all) are one person; their deals are listed together.
  const people = useMemo(() => groupPeople(rows ?? []), [rows])

  const dupeKeys = useMemo(() => {
    // After grouping, "possible duplicate" means two different entries that
    // still share a phone or email (e.g. a name typed two different ways).
    const seen = new Map<string, number>()
    for (const p of people) {
      for (const k of new Set([normPhone(p.phone), normEmail(p.email)])) {
        if (k) seen.set(k, (seen.get(k) ?? 0) + 1)
      }
    }
    const dupes = new Set<string>()
    for (const p of people) {
      for (const k of [normPhone(p.phone), normEmail(p.email)]) {
        if (k && (seen.get(k) ?? 0) > 1) dupes.add(p.key)
      }
    }
    return dupes
  }, [people])

  if (!rows) return <div className="centered"><div className="spinner" /></div>

  function matches(p: Person) {
    if (dupesOnly && !dupeKeys.has(p.key)) return false
    if (!q.trim()) return true
    const needle = q.trim().toLowerCase()
    return p.entries.some((r) => [r.name, r.email, r.phone, r.roleLabel, r.context, r.address, r.businessName]
      .some((field) => field?.toLowerCase().includes(needle)))
  }

  const clientRows = people.filter((p) => p.isClient).filter(matches)
  const professionalRows = people.filter((p) => !p.isClient).filter(matches)

  function renderRow(p: Person) {
    const clientLink = p.entries.find((r) => r.kind === 'lead')?.href ?? p.entries.find((r) => r.href)?.href
    const closed = p.entries.find((r) => r.closedLeadId)
    return (
      <div className="note" key={p.key}>
        <div className="notemeta">
          <span className="noteauthor">
            {p.isClient && clientLink ? <Link to={clientLink}>{p.name}</Link> : p.name}
          </span>
          {p.businessName && <span className="notewhen">{p.businessName}</span>}
          <span className="notewhen">{p.roles.join(', ')}</span>
          {dupeKeys.has(p.key) && (
            <span className="notewhen" style={{ color: 'var(--danger)' }}
                  title="Another entry has the same phone or email">Possible duplicate</span>
          )}
        </div>
        <p className="notebody" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>
            {[p.phone, p.email, p.address].filter(Boolean).join(' · ') || <span className="muted">No contact info</span>}
          </span>
          {closed && (
            <button type="button" className="btn" style={{ flex: 'none' }}
                    disabled={reactivatingId === closed.key}
                    onClick={() => reactivate(closed)}>
              {reactivatingId === closed.key ? 'Reactivating…' : 'Reactivate for a new deal →'}
            </button>
          )}
        </p>
        {/* Where this person shows up: each deal / client file / saved entry.
            Delete removes just that one entry, not the person everywhere. */}
        <div className="rolowhere">
          {p.entries.map((r) => (
            <span key={r.key} className="rolochip">
              {r.href ? <Link to={r.href}>{r.context}</Link> : <span>{r.context}</span>}
              {isDatabaseManager && (
                <button type="button" className="rolodel" disabled={deletingKey === r.key}
                        onClick={() => deleteRow(r)}
                        title={r.kind === 'lead' ? 'Permanently delete this client file' : `Remove from ${r.context}`}>✕</button>
              )}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="admin">
      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 17.5 }}>Rolodex</span>
      </header>
      <AdminNav current="rolodex" />

      <div className="card setcard">
        <div className="field2">
          <div className="field">
            <label>Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Name, phone, email, category, or address" />
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
            <p className="muted" style={{ fontSize: 15 }}>Nothing matches.</p>
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
            <p className="muted" style={{ fontSize: 15 }}>Nothing matches.</p>
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
  onSave: (values: { name: string; businessName: string; roleLabel: string; phone: string; email: string; address: string }) => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [roleLabel, setRoleLabel] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    await onSave({ name, businessName, roleLabel, phone, email, address })
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
          <label>Business name</label>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                 placeholder="ABC Title Company" />
        </div>
      </div>
      <div className="field2">
        <div className="field">
          <label>Category</label>
          <input value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)}
                 placeholder="Title Company, Inspector, Lender…" />
        </div>
        <div className="field">
          <label>Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(407) 555-0100" />
        </div>
      </div>
      <div className="field2">
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                 placeholder="jordan@example.com" />
        </div>
        <div className="field">
          <label>Address</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)}
                 placeholder="123 Main St, Orlando, FL 32801" />
        </div>
      </div>
      <div className="savebar">
        <button className="btn primary" disabled={busy}>{busy ? 'Adding…' : 'Add contact'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

interface Person {
  key: string
  name: string
  isClient: boolean
  roles: string[]
  phone: string | null
  email: string | null
  address: string | null
  businessName: string | null
  entries: Row[]
}

/** Same name + (same phone, same email, or no phone/email on one side) =
 *  one person. Clients and professionals are grouped separately. */
function groupPeople(rows: Row[]): Person[] {
  const groups: Person[] = []
  for (const r of [...rows].sort((a, b) => a.name.localeCompare(b.name))) {
    const name = r.name.trim().toLowerCase()
    const ph = normPhone(r.phone); const em = normEmail(r.email)
    const match = groups.find((g) => g.isClient === r.isClient && g.name.trim().toLowerCase() === name && (
      (!ph && !em) || (!g.phone && !g.email)
      || (ph && normPhone(g.phone) === ph) || (em && normEmail(g.email) === em)))
    if (match) {
      match.entries.push(r)
      if (!match.roles.includes(r.roleLabel)) match.roles.push(r.roleLabel)
      match.phone ||= r.phone; match.email ||= r.email
      match.address ||= r.address ?? null; match.businessName ||= r.businessName ?? null
    } else {
      groups.push({
        key: `p-${r.key}`, name: r.name.trim(), isClient: r.isClient, roles: [r.roleLabel],
        phone: r.phone, email: r.email, address: r.address ?? null, businessName: r.businessName ?? null,
        entries: [r],
      })
    }
  }
  return groups
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
