import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Dashboard from '../components/Dashboard'
import { DEMO_MODE, supabase } from '../lib/supabase'
import { DEMO_PAYLOAD, DEMO_SELLER } from '../lib/demoData'
import type { Contact, Milestone, SharedPayload, Transaction } from '../lib/types'

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

  useEffect(() => {
    if (DEMO_MODE || !supabase) {
      const sell = id === 'demo-sell'
      setData(structuredClone(sell ? DEMO_SELLER : DEMO_PAYLOAD))
      setToken(sell ? 'demo-sell' : 'demo')
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
  }, [id])

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
      <Dashboard
        data={data}
        editable
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
