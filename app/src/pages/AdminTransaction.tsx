import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Dashboard from '../components/Dashboard'
import { DEMO_MODE, supabase } from '../lib/supabase'
import { DEMO_BY_TOKEN, DEMO_PAYLOAD, SAVED_CONTACTS, TEAM_MEMBERS, TRANSACTION_ASSIGNEES } from '../lib/demoData'
import { ROLE_LABEL, type Contact, type Milestone, type SavedContact, type SharedPayload, type Side, type TeamMember, type Transaction } from '../lib/types'
import AdminNav from '../components/AdminNav'
import './Admin.css'

/**
 * Allison's editing view. Same Dashboard component as the client page, with
 * editable=true — one layout to maintain, so the thing she edits is literally
 * the thing her client sees.
 *
 * Writes are optimistic. She clicks a lot of checkboxes in a row and should
 * never wait on a round trip; if a write fails we roll that one item back.
 */
export default function AdminTransaction() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<SharedPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Who's on this deal. Admin-only — never part of the payload the client link
  // can see, and never routed through get_shared_transaction.
  const [roster, setRoster] = useState<TeamMember[]>([])
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set())
  const [savedContacts, setSavedContacts] = useState<SavedContact[]>([])
  // Contacts flagged internal_only — excluded from get_shared_transaction(),
  // so they need their own fetch straight from the table (same admin-only
  // story as roster/assignedIds above).
  const [internalContacts, setInternalContacts] = useState<Contact[]>([])

  function loadAll() {
    if (DEMO_MODE || !supabase) {
      const payload = DEMO_BY_TOKEN[id ?? 'demo'] ?? DEMO_PAYLOAD
      setData(structuredClone(payload))
      setToken(id === 'demo-sell' || id === 'demo-loan' ? id : 'demo')
      setRoster(TEAM_MEMBERS)
      setAssignedIds(new Set(TRANSACTION_ASSIGNEES[id ?? ''] ?? []))
      setSavedContacts(SAVED_CONTACTS)
      setInternalContacts([])
      return
    }
    // The admin view reads through the same assembling function so both pages
    // are guaranteed to show identical data. She authenticates separately.
    supabase.from('transactions').select('share_token').eq('id', id).single()
      .then(({ data: row, error }) => {
        if (error) { setLoadError(error.message); return }
        const t = row?.share_token as string | undefined
        if (!t) { setLoadError('This transaction has no share token on file.'); return }
        setToken(t)
        supabase!.rpc('get_shared_transaction', { p_token: t })
          .then(({ data: payload, error: rpcError }) => {
            if (rpcError) { setLoadError(rpcError.message); return }
            setData(payload as SharedPayload)
          })
      })
    supabase.from('team_members').select('*').order('sort_order')
      .then(({ data: rows }) => setRoster((rows as TeamMember[]) ?? []))
    supabase.from('transaction_assignees').select('team_member_id').eq('transaction_id', id)
      .then(({ data: rows }) =>
        setAssignedIds(new Set((rows ?? []).map((r) => r.team_member_id as string))))
    supabase.from('saved_contacts').select('*').order('sort_order')
      .then(({ data: rows }) => setSavedContacts((rows as SavedContact[]) ?? []))
    supabase.from('contacts').select('*').eq('transaction_id', id).eq('internal_only', true).order('sort_order')
      .then(({ data: rows }) => setInternalContacts((rows as Contact[]) ?? []))
  }

  useEffect(() => { loadAll() }, [id])

  // Same file, more than one person: an agent and a lender (or two agents)
  // can have this same transaction open together. Reload everything on any
  // change to any of the tables that make up this page, rather than trying
  // to patch each field in from the wire individually.
  useEffect(() => {
    if (DEMO_MODE || !supabase || !id) return
    const channel = supabase.channel(`transaction-${id}`)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `id=eq.${id}` }, loadAll)
    for (const table of ['contacts', 'milestones', 'doc_lines', 'notes', 'transaction_assignees']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `transaction_id=eq.${id}` }, loadAll)
    }
    channel.subscribe()
    return () => { supabase!.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function toggleAssignee(memberId: string) {
    const isOn = assignedIds.has(memberId)
    setAssignedIds((cur) => {
      const next = new Set(cur)
      isOn ? next.delete(memberId) : next.add(memberId)
      return next
    })
    if (DEMO_MODE || !supabase || !id) return
    if (isOn) {
      await supabase.from('transaction_assignees').delete()
        .eq('transaction_id', id).eq('team_member_id', memberId)
    } else {
      await supabase.from('transaction_assignees')
        .insert({ transaction_id: id, team_member_id: memberId })
    }
  }

  // Picking someone as the Realtor or Lender on the client-facing side doesn't
  // by itself grant them visibility into the deal — that's controlled by
  // transaction_assignees (see migration 005). Without this, a loan officer
  // picked via onPickLender could be shown to the client but unable to open
  // the transaction themselves.
  async function ensureAssignee(memberId: string | null) {
    if (!memberId || assignedIds.has(memberId)) return
    setAssignedIds((cur) => new Set(cur).add(memberId))
    if (DEMO_MODE || !supabase || !id) return
    await supabase.from('transaction_assignees')
      .insert({ transaction_id: id, team_member_id: memberId })
  }

  function patch(fn: (d: SharedPayload) => SharedPayload) {
    setData((cur) => (cur ? fn(structuredClone(cur)) : cur))
  }

  async function write(table: string, rowId: string, values: Record<string, unknown>) {
    if (DEMO_MODE || !supabase) return
    const { error } = await supabase.from(table).update(values).eq('id', rowId)
    if (error) console.error(`${table} update failed`, error)
  }

  const handlers = {
    onToggleMilestone: (m: Milestone) => {
      const next = !m.is_complete
      patch((d) => {
        const t = d.milestones.find((x) => x.id === m.id)
        if (t) t.is_complete = next
        return d
      })
      write('milestones', m.id, {
        is_complete: next,
        completed_at: next ? new Date().toISOString() : null,
      })
    },

    onChangeMilestoneDate: (m: Milestone, value: string | null) => {
      patch((d) => {
        const t = d.milestones.find((x) => x.id === m.id)
        if (t) t.date_value = value
        return d
      })
      write('milestones', m.id, { date_value: value })
    },

    onToggleDocLine: (lineId: string, checked: boolean) => {
      patch((d) => {
        const t = d.doc_lines.find((x) => x.id === lineId)
        if (t) t.is_checked = checked
        return d
      })
      write('doc_lines', lineId, { is_checked: checked })
    },

    onChangeDocLine: (lineId: string, text: string) => {
      patch((d) => {
        const t = d.doc_lines.find((x) => x.id === lineId)
        if (t) t.text = text
        return d
      })
      write('doc_lines', lineId, { text })
    },

    onPatchTransaction: (values: Partial<Transaction>) => {
      patch((d) => ({ ...d, transaction: { ...d.transaction, ...values } }))
      if (!id) return
      write('transactions', id, values as Record<string, unknown>)
    },

    onPatchContact: (contactId: string, values: Partial<Contact>) => {
      patch((d) => {
        const t = d.contacts.find((x) => x.id === contactId)
        if (t) Object.assign(t, values)
        return d
      })
      write('contacts', contactId, values as Record<string, unknown>)
    },

    onUploadPhoto: async (file: File) => {
      // Show it immediately either way; in demo mode that's all that happens.
      const localUrl = URL.createObjectURL(file)
      patch((d) => ({ ...d, transaction: { ...d.transaction, photo_url: localUrl } }))
      if (DEMO_MODE || !supabase || !id) return

      const path = `properties/${id}-${Date.now()}-${file.name}`
      const { error } = await supabase.storage.from('media')
        .upload(path, file, { upsert: true })
      if (error) { console.error('photo upload failed', error); return }

      const { data } = supabase.storage.from('media').getPublicUrl(path)
      patch((d) => ({ ...d, transaction: { ...d.transaction, photo_url: data.publicUrl } }))
      write('transactions', id, { photo_url: data.publicUrl })
    },

    onChangeRealtor: (memberId: string | null) => {
      const member = roster.find((m) => m.id === memberId)
      patch((d) => ({
        ...d,
        transaction: { ...d.transaction, realtor_member_id: memberId },
        realtor: member ? {
          full_name: member.full_name, license_number: member.license_number,
          headshot_url: member.headshot_url, phone: member.phone, email: member.email,
        } : null,
      }))
      if (!id) return
      write('transactions', id, { realtor_member_id: memberId })
      ensureAssignee(memberId)
    },

    onAddNote: async (side: Side, body: string) => {
      if (DEMO_MODE || !supabase || !id) {
        patch((d) => ({
          ...d,
          notes: [{
            id: `local-${Date.now()}`, side, author_name: 'You', body,
            created_at: new Date().toISOString(),
          }, ...d.notes],
        }))
        return
      }
      const { data: auth } = await supabase.auth.getUser()
      const { data: me } = await supabase.from('profiles')
        .select('full_name').eq('id', auth.user?.id).single()
      const authorName = me?.full_name || null

      const { data: row, error } = await supabase.from('notes')
        .insert({ transaction_id: id, side, body, author_name: authorName })
        .select('id, created_at').single()
      if (error || !row) { console.error('note insert failed', error); return }

      patch((d) => ({
        ...d,
        notes: [{ id: row.id, side, author_name: authorName, body, created_at: row.created_at }, ...d.notes],
      }))
    },

    onPickLender: (memberId: string) => {
      const member = roster.find((m) => m.id === memberId)
      if (!member) return
      const lender = {
        name: member.full_name, company: member.company_name, license: member.license_number,
        headshot_url: member.headshot_url, phone: member.phone, email: member.email,
        is_in_house: true, nmls_number: member.nmls_number,
        website_1: member.lender_website_1, website_2: member.lender_website_2,
        website_3: member.lender_website_3,
      }
      patch((d) => ({
        ...d, transaction: { ...d.transaction, lender, lender_member_id: memberId },
      }))
      if (!id) return
      write('transactions', id, { lender_member_id: memberId })
      ensureAssignee(memberId)
    },

    // Best-effort: fills in whatever fetch-link-preview finds and leaves the
    // rest for her to type — most sites (Zillow especially) won't yield the
    // property facts since those load in client-side, after a plain fetch()
    // already gave up.
    onFetchListingPreview: async (url: string) => {
      if (DEMO_MODE || !supabase || !id) return
      const { data: preview } = await supabase.functions.invoke('fetch-link-preview', { body: { url } })
      if (!preview) return
      const values: Record<string, unknown> = {}
      if (preview.photo_url && !data?.transaction.photo_url) values.photo_url = preview.photo_url
      if (preview.hoa_fee) values.hoa_fee = preview.hoa_fee
      if (preview.property_tax) values.property_tax = preview.property_tax
      if (preview.school_district) values.school_district = preview.school_district
      if (preview.county) values.county = preview.county
      if (Object.keys(values).length === 0) return
      patch((d) => ({ ...d, transaction: { ...d.transaction, ...values } }))
      write('transactions', id, values)
    },

    onPickSavedContact: (contactId: string, savedId: string) => {
      const s = savedContacts.find((x) => x.id === savedId)
      if (!s) return
      patch((d) => {
        const t = d.contacts.find((x) => x.id === contactId)
        if (t) { t.name = s.name; t.phone = s.phone; t.email = s.email; t.photo_url = s.photo_url }
        return d
      })
      write('contacts', contactId, {
        name: s.name, phone: s.phone, email: s.email, photo_url: s.photo_url,
      })
    },

    onSaveContact: async (contact: Contact) => {
      if (!contact.name?.trim()) return
      const row = {
        group_key: contact.group_key, role_label: contact.role_label,
        name: contact.name, phone: contact.phone, email: contact.email,
        photo_url: contact.photo_url, sort_order: 0,
      }
      // Saving the same name again (after tweaking a phone number, say)
      // should update that one entry, not pile up duplicates.
      const matches = (s: SavedContact) =>
        s.group_key === row.group_key && s.role_label === row.role_label && s.name === row.name

      if (DEMO_MODE || !supabase) {
        setSavedContacts((cur) => {
          const existing = cur.find(matches)
          return existing
            ? cur.map((s) => (s === existing ? { ...s, ...row } : s))
            : [...cur, { id: `local-${Date.now()}`, ...row }]
        })
        return
      }
      const { data: auth } = await supabase.auth.getUser()
      const { data: me } = await supabase.from('profiles')
        .select('team_id').eq('id', auth.user?.id).single()
      if (!me?.team_id) return

      const { data: existing } = await supabase.from('saved_contacts')
        .select('id').eq('team_id', me.team_id).eq('group_key', row.group_key)
        .eq('role_label', row.role_label).eq('name', row.name).maybeSingle()

      if (existing) {
        const { data: updated } = await supabase.from('saved_contacts')
          .update(row).eq('id', existing.id).select('*').single()
        if (updated) setSavedContacts((cur) => cur.map((s) => (s.id === existing.id ? updated as SavedContact : s)))
      } else {
        const { data: saved } = await supabase.from('saved_contacts')
          .insert({ team_id: me.team_id, ...row }).select('*').single()
        if (saved) setSavedContacts((cur) => [...cur, saved as SavedContact])
      }
    },

    onUploadContactPhoto: async (contactId: string, file: File) => {
      const localUrl = URL.createObjectURL(file)
      patch((d) => {
        const t = d.contacts.find((x) => x.id === contactId)
        if (t) t.photo_url = localUrl
        return d
      })
      if (DEMO_MODE || !supabase) return

      const path = `contacts/${contactId}-${Date.now()}-${file.name}`
      const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true })
      if (error) { console.error('contact photo upload failed', error); return }

      const { data } = supabase.storage.from('media').getPublicUrl(path)
      patch((d) => {
        const t = d.contacts.find((x) => x.id === contactId)
        if (t) t.photo_url = data.publicUrl
        return d
      })
      write('contacts', contactId, { photo_url: data.publicUrl })
    },

    onPatchInternalContact: (contactId: string, values: Partial<Contact>) => {
      setInternalContacts((cur) => cur.map((c) => (c.id === contactId ? { ...c, ...values } : c)))
      write('contacts', contactId, values as Record<string, unknown>)
    },

    onAddInternalContact: async () => {
      if (DEMO_MODE || !supabase || !id) {
        setInternalContacts((cur) => [...cur, {
          id: `local-${Date.now()}`, group_key: 'people', role_label: 'Contact',
          name: null, phone: null, email: null, note: null, photo_url: null,
          sort_order: cur.length,
        }])
        return
      }
      const { data: row, error } = await supabase.from('contacts')
        .insert({
          transaction_id: id, group_key: 'people', role_label: 'Contact',
          internal_only: true, sort_order: internalContacts.length,
        })
        .select('*').single()
      if (error || !row) { console.error('internal contact insert failed', error); return }
      setInternalContacts((cur) => [...cur, row as Contact])
    },

    onRemoveInternalContact: async (contactId: string) => {
      setInternalContacts((cur) => cur.filter((c) => c.id !== contactId))
      if (DEMO_MODE || !supabase) return
      const { error } = await supabase.from('contacts').delete().eq('id', contactId)
      if (error) console.error('internal contact delete failed', error)
    },

    onUploadInternalContactPhoto: async (contactId: string, file: File) => {
      const localUrl = URL.createObjectURL(file)
      setInternalContacts((cur) => cur.map((c) => (c.id === contactId ? { ...c, photo_url: localUrl } : c)))
      if (DEMO_MODE || !supabase) return

      const path = `contacts/${contactId}-${Date.now()}-${file.name}`
      const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true })
      if (error) { console.error('internal contact photo upload failed', error); return }

      const { data } = supabase.storage.from('media').getPublicUrl(path)
      setInternalContacts((cur) => cur.map((c) => (c.id === contactId ? { ...c, photo_url: data.publicUrl } : c)))
      write('contacts', contactId, { photo_url: data.publicUrl })
    },
  }

  function copyLink() {
    if (!token) return
    navigator.clipboard.writeText(`${window.location.origin}/t/${token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  // Marks this deal closed & funded — moves the linked lead (if it came from
  // Active Buyers) into the Closed list and sets up the yearly anniversary
  // reminder. Asks for the date rather than assuming "today," since this
  // often gets entered a day or two after the fact.
  async function markClosed() {
    if (!id) return
    const existing = data?.transaction.closed_and_funded_date
    const input = prompt('What date did this close & fund? (YYYY-MM-DD)', existing ?? new Date().toISOString().slice(0, 10))
    if (!input) return
    const dateStr = input.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { alert('Please enter a date as YYYY-MM-DD.'); return }

    if (DEMO_MODE || !supabase) {
      patch((d) => ({ ...d, transaction: { ...d.transaction, closed_and_funded: true, closed_and_funded_date: dateStr, status: 'closed' } }))
      return
    }
    const { error } = await supabase.rpc('mark_transaction_closed', { p_transaction_id: id, p_closed_date: dateStr })
    if (error) { alert(error.message); return }
    patch((d) => ({ ...d, transaction: { ...d.transaction, closed_and_funded: true, closed_and_funded_date: dateStr, status: 'closed' } }))
  }

  if (loadError) {
    return (
      <div className="centered">
        <p className="muted" style={{ maxWidth: 360, textAlign: 'center' }}>
          Couldn't load this transaction: {loadError}
        </p>
      </div>
    )
  }
  if (!data) return <div className="centered"><div className="spinner" /></div>

  return (
    <>
      {DEMO_MODE && (
        <div className="demobar">
          Demo data — no database connected yet. Your changes look real but aren’t saved.
        </div>
      )}
      <div className="admin" style={{ paddingTop: 16, paddingBottom: 0 }}>
        <AdminNav current="transactions" />
        <AssignedTo roster={roster} assignedIds={assignedIds} onToggle={toggleAssignee} />
        <div className="card setcard" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 10,
        }}>
          {data.transaction.closed_and_funded ? (
            <>
              <span style={{ fontWeight: 700, color: '#2ecc40' }}>
                ✓ Closed &amp; funded {data.transaction.closed_and_funded_date &&
                  `on ${new Date(data.transaction.closed_and_funded_date + 'T00:00:00').toLocaleDateString()}`}
              </span>
              <button className="btn" onClick={markClosed}>Edit date</button>
            </>
          ) : (
            <>
              <span className="muted" style={{ fontSize: 13 }}>
                Once funds have disbursed, mark this closed to move the client's file to Closed.
              </span>
              <button className="btn primary" onClick={markClosed}>Closed &amp; Funded</button>
            </>
          )}
        </div>
      </div>
      <Dashboard
        data={data}
        editable
        roster={roster}
        savedContacts={savedContacts}
        internalContacts={internalContacts}
        headerExtra={
          <span style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
            <Link className="btn" to="/admin">All transactions</Link>
            <button className="btn" onClick={copyLink}>
              {copied ? 'Copied' : 'Copy client link'}
            </button>
          </span>
        }
        {...handlers}
      />
    </>
  )
}

/**
 * Who's on this deal. Click a chip to add or remove someone from your roster
 * (Settings › Team) — this is what limits their view to just their own deals
 * once they're the ones logged in.
 */
function AssignedTo({ roster, assignedIds, onToggle }: {
  roster: TeamMember[]; assignedIds: Set<string>; onToggle: (id: string) => void
}) {
  if (roster.length === 0) return null
  return (
    <div className="card setcard" style={{ marginBottom: 16 }}>
      <h2>Assigned to</h2>
      <p className="sethelp" style={{ marginBottom: 12 }}>
        Only people checked here (or anyone marked "sees every transaction" in
        Settings › Team) will see this deal.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {roster.map((m) => {
          const on = assignedIds.has(m.id) || m.sees_all_transactions
          return (
            <button
              key={m.id}
              disabled={m.sees_all_transactions}
              title={m.sees_all_transactions
                ? `${m.full_name} sees every transaction (set in Settings › Team)`
                : undefined}
              onClick={() => onToggle(m.id)}
              style={{
                fontSize: 12, letterSpacing: '.02em',
                border: `1px solid ${on ? 'var(--gold-soft)' : 'var(--line)'}`,
                borderRadius: 999, padding: '6px 12px',
                color: on ? 'var(--gold-bright)' : 'var(--ink-faint)',
                background: 'none', flex: 'none',
                cursor: m.sees_all_transactions ? 'default' : 'pointer',
              }}
            >
              {m.full_name || 'Unnamed'}
              {m.roles.length > 0 && ` · ${m.roles.map((r) => ROLE_LABEL[r]).join(', ')}`}
            </button>
          )
        })}
      </div>
    </div>
  )
}
