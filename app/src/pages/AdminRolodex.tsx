import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import AdminNav from '../components/AdminNav'
import './Admin.css'

interface Row {
  key: string
  name: string
  phone: string | null
  email: string | null
  roleLabel: string
  context: string
  href: string
}

/**
 * "Virtual rolodex" — every named person across every transaction's contacts
 * plus every active buyer, in one searchable list, so Allison (or anyone with
 * the whole-book view) can spot the same person entered twice and clean it
 * up. RLS already decides which transactions/leads are visible to whoever's
 * signed in — this just flattens whatever comes back into one list, same as
 * the platform-admin bypass transparently extends to cover other teams later
 * without this page needing to know that.
 *
 * Utility vendors (Power, HOA, etc.) are left out on purpose — this is about
 * people, which is what "clients being duplicated" is actually about.
 */
export default function AdminRolodex() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState('')
  const [dupesOnly, setDupesOnly] = useState(false)
  const nav = useNavigate()

  useEffect(() => {
    if (DEMO_MODE || !supabase) { setRows([]); return }

    async function load() {
      const { data: auth } = await supabase!.auth.getUser()
      if (!auth.user) { nav('/login'); return }

      const { data: contactRows } = await supabase!
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
      const { data: leadRows } = await supabase!
        .from('leads')
        .select('id, full_name, phone, email')
        .is('archived_at', null)
        .is('converted_transaction_id', null)

      const fromContacts: Row[] = ((contactRows ?? []) as unknown as Array<{
        id: string; name: string; phone: string | null; email: string | null
        role_label: string; transaction_id: string
        transactions: { address_line: string; city_state_zip: string } | null
      }>).map((c) => ({
        key: `c-${c.id}`,
        name: c.name,
        phone: c.phone,
        email: c.email,
        roleLabel: c.role_label,
        context: c.transactions?.address_line || 'Untitled transaction',
        href: `/admin/t/${c.transaction_id}`,
      }))

      const fromLeads: Row[] = ((leadRows ?? []) as Array<{
        id: string; full_name: string; phone: string | null; email: string | null
      }>).filter((l) => l.full_name?.trim()).map((l) => ({
        key: `l-${l.id}`,
        name: l.full_name,
        phone: l.phone,
        email: l.email,
        roleLabel: 'Active client',
        context: 'Active Clients',
        href: `/admin/leads/${l.id}`,
      }))

      setRows([...fromContacts, ...fromLeads])
    }
    load()
  }, [nav])

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

  const filtered = rows
    .filter((r) => !dupesOnly || dupeKeys.has(r.key))
    .filter((r) => {
      if (!q.trim()) return true
      const needle = q.trim().toLowerCase()
      return r.name.toLowerCase().includes(needle)
        || r.email?.toLowerCase().includes(needle)
        || r.phone?.toLowerCase().includes(needle)
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="admin">
      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 15 }}>Rolodex</span>
      </header>
      <AdminNav current="rolodex" />

      <div className="card setcard">
        <p className="sethelp">
          Every named person across your transactions and active buyers, in one place —
          useful for catching the same client entered twice.
        </p>
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

        {filtered.length === 0 ? (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Nothing matches.</p>
        ) : (
          <div className="notelist" style={{ marginTop: 10 }}>
            {filtered.map((r) => (
              <div className="note" key={r.key}>
                <div className="notemeta">
                  <span className="noteauthor">{r.name}</span>
                  <span className="notewhen">{r.roleLabel}</span>
                  {dupeKeys.has(r.key) && (
                    <span className="notewhen" style={{ color: 'var(--danger)' }}>Possible duplicate</span>
                  )}
                </div>
                <p className="notebody">
                  {[r.phone, r.email].filter(Boolean).join(' · ') || <span className="muted">No contact info</span>}
                  {' — '}
                  <Link to={r.href}>{r.context}</Link>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
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
