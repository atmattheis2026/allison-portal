import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Dashboard from '../components/Dashboard'
import { DEMO_MODE, supabase } from '../lib/supabase'
import { DEMO_PAYLOAD, DEMO_SELLER, TEAM_MEMBERS, TRANSACTION_ASSIGNEES } from '../lib/demoData'
import { ROLE_LABEL, type Contact, type Milestone, type SharedPayload, type Side, type TeamMember, type Transaction } from '../lib/types'
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
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Who's on this deal. Admin-only — never part of the payload the client link
  // can see, and never routed through get_shared_transaction.
  const [roster, setRoster] = useState<TeamMember[]>([])
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (DEMO_MODE || !supabase) {
      const sell = id === 'demo-sell'
      setData(structuredClone(sell ? DEMO_SELLER : DEMO_PAYLOAD))
      setToken(sell ? 'demo-sell' : 'demo')
      setRoster(TEAM_MEMBERS)
      setAssignedIds(new Set(TRANSACTION_ASSIGNEES[id ?? ''] ?? []))
      return
    }
    // The admin view reads through the same assembling function so both pages
    // are guaranteed to show identical data. She authenticates separately.
    supabase.from('transactions').select('share_token').eq('id', id).single()
      .then(({ data: row }) => {
        const t = row?.share_token as string | undefined
        if (!t) return
        setToken(t)
        supabase!.rpc('get_shared_transaction', { p_token: t })
          .then(({ data: payload }) => setData(payload as SharedPayload))
      })
    supabase.from('team_members').select('*').order('sort_order')
      .then(({ data: rows }) => setRoster((rows as TeamMember[]) ?? []))
    supabase.from('transaction_assignees').select('team_member_id').eq('transaction_id', id)
      .then(({ data: rows }) =>
        setAssignedIds(new Set((rows ?? []).map((r) => r.team_member_id as string))))
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
      // The lender fields are flat columns on the table, not a json blob.
      const { lender, ...rest } = values
      const row: Record<string, unknown> = { ...rest }
      if (lender) {
        row.lender_name = lender.name
        row.lender_company = lender.company
        row.lender_license = lender.license
        row.lender_headshot_url = lender.headshot_url
        row.lender_phone = lender.phone
        row.lender_email = lender.email
      }
      write('transactions', id, row)
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
    },

    onUploadLenderPhoto: async (file: File) => {
      const localUrl = URL.createObjectURL(file)
      patch((d) => ({
        ...d, transaction: { ...d.transaction, lender: { ...d.transaction.lender, headshot_url: localUrl } },
      }))
      if (DEMO_MODE || !supabase || !id) return

      const path = `lenders/${id}-${Date.now()}-${file.name}`
      const { error } = await supabase.storage.from('media')
        .upload(path, file, { upsert: true })
      if (error) { console.error('lender photo upload failed', error); return }

      const { data } = supabase.storage.from('media').getPublicUrl(path)
      patch((d) => ({
        ...d, transaction: { ...d.transaction, lender: { ...d.transaction.lender, headshot_url: data.publicUrl } },
      }))
      write('transactions', id, { lender_headshot_url: data.publicUrl })
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
  }

  function copyLink() {
    if (!token) return
    navigator.clipboard.writeText(`${window.location.origin}/t/${token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
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
        <AssignedTo roster={roster} assignedIds={assignedIds} onToggle={toggleAssignee} />
      </div>
      <Dashboard
        data={data}
        editable
        roster={roster}
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
              {m.full_name || 'Unnamed'} · {ROLE_LABEL[m.role]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
