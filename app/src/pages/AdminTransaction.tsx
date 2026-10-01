import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Dashboard, { type ContactSuggestion } from '../components/Dashboard'
import { DEMO_MODE, supabase } from '../lib/supabase'
import { DEMO_BY_TOKEN, DEMO_PAYLOAD, SAVED_CONTACTS, TEAM_MEMBERS, TRANSACTION_ASSIGNEES } from '../lib/demoData'
import { ROLE_LABEL, type Contact, type Milestone, type SavedContact, type SharedPayload, type Side, type TeamMember, type Transaction, type TxStatus } from '../lib/types'
import AdminNav from '../components/AdminNav'
import { useDeskLayout } from '../lib/useDeskLayout'
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
  // Checklist steps she removed from this one transaction (a condo's survey,
  // a cash deal's appraisal). They're milestones.internal_only rows, which
  // get_shared_transaction() already leaves out — so the client never sees
  // them, and they need their own fetch here, same as internalContacts.
  const [hiddenMilestones, setHiddenMilestones] = useState<Milestone[]>([])
  const [contactSuggestions, setContactSuggestions] = useState<ContactSuggestion[]>([])
  const [remoteUpdate, setRemoteUpdate] = useState(false)
  // The questions asked right after "Cancel transaction" about the client.
  const [followUp, setFollowUp] = useState<FollowUp | null>(null)
  const [startingNew, setStartingNew] = useState(false)
  const nav = useNavigate()
  // On a computer the deal page uses the desk layout: the assigned-to chips
  // and the close/cancel buttons move into the deal's own summary strip.
  const desk = useDeskLayout()
  // Every write on this page goes through write()/toggleAssignee()/
  // ensureAssignee() — this timestamp lets the realtime listener tell "I just
  // saved this myself" apart from "someone else changed it," so it doesn't
  // pop the banner up after your own edit.
  const justSavedRef = useRef(0)

  function loadAll() {
    if (DEMO_MODE || !supabase) {
      const payload = DEMO_BY_TOKEN[id ?? 'demo'] ?? DEMO_PAYLOAD
      setData(structuredClone(payload))
      setToken(id === 'demo-sell' || id === 'demo-loan' ? id : 'demo')
      setRoster(TEAM_MEMBERS)
      setAssignedIds(new Set(TRANSACTION_ASSIGNEES[id ?? ''] ?? []))
      setSavedContacts(SAVED_CONTACTS)
      setContactSuggestions(buildSuggestions(SAVED_CONTACTS,
        Object.values(DEMO_BY_TOKEN).flatMap((p) => p.contacts)))
      setInternalContacts([])
      setHiddenMilestones([])
      return
    }
    // The admin view reads through the same assembling function so both pages
    // are guaranteed to show identical data. She authenticates separately.
    supabase.from('transactions').select('share_token, team_id, realtor_member_id, lender_member_id').eq('id', id).single()
      .then(({ data: row, error }) => {
        if (error) { setLoadError(error.message); return }
        // Only this deal's own team. Allison's account can see every team's
        // roster (is_platform_admin), which put other teams' people, and
        // duplicate names, in the Realtor and Loan Officer dropdowns.
        // Plus whoever is already on this deal, even from another team, so
        // their name still shows in the dropdown rather than "Choose…".
        const onDeal = [row.realtor_member_id, row.lender_member_id].filter(Boolean)
        const rosterFilter = onDeal.length
          ? `team_id.eq.${row.team_id},id.in.(${onDeal.join(',')})`
          : `team_id.eq.${row.team_id}`
        supabase!.from('team_members').select('*').or(rosterFilter).order('sort_order')
          .then(({ data: rows }) => setRoster((rows as TeamMember[]) ?? []))
        loadContactBook(row.team_id)
        const t = row?.share_token as string | undefined
        if (!t) { setLoadError('This transaction has no share token on file.'); return }
        setToken(t)
        supabase!.rpc('get_shared_transaction', { p_token: t })
          .then(({ data: payload, error: rpcError }) => {
            if (rpcError) { setLoadError(rpcError.message); return }
            setData(payload as SharedPayload)
          })
      })
    supabase.from('transaction_assignees').select('team_member_id').eq('transaction_id', id)
      .then(({ data: rows }) =>
        setAssignedIds(new Set((rows ?? []).map((r) => r.team_member_id as string))))
    supabase.from('contacts').select('*').eq('transaction_id', id).eq('internal_only', true).order('sort_order')
      .then(({ data: rows }) => setInternalContacts((rows as Contact[]) ?? []))
    supabase.from('milestones').select('*').eq('transaction_id', id).eq('internal_only', true).order('sort_order')
      .then(({ data: rows }) => setHiddenMilestones((rows as Milestone[]) ?? []))
  }

  /** Saved contacts plus every named contact on this team's deals, for the
   *  as-you-type name suggestions. Filtered to the deal's team because
   *  Allison's account can read every team's rows (is_platform_admin). */
  async function loadContactBook(teamId: string) {
    if (!supabase) return
    const [{ data: saved }, { data: onDeals }] = await Promise.all([
      supabase.from('saved_contacts').select('*').eq('team_id', teamId).order('sort_order'),
      supabase.from('contacts').select('*, transactions!inner(team_id)')
        .eq('transactions.team_id', teamId).not('name', 'is', null).limit(5000),
    ])
    const savedRows = (saved as SavedContact[]) ?? []
    setSavedContacts(savedRows)
    setContactSuggestions(buildSuggestions(savedRows, (onDeals as Contact[]) ?? []))
  }

  useEffect(() => { loadAll() }, [id])

  // Same file, more than one person: an agent and a lender (or two agents)
  // can have this same transaction open together. Rather than silently
  // reload (which fights with fields that save on every keystroke), just
  // flag that something changed and let whoever's looking choose to refresh.
  useEffect(() => {
    if (DEMO_MODE || !supabase || !id) return
    const channel = supabase.channel(`transaction-${id}`)
    function onRemoteChange() {
      if (Date.now() - justSavedRef.current < 2500) return
      setRemoteUpdate(true)
    }
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `id=eq.${id}` }, onRemoteChange)
    for (const table of ['contacts', 'milestones', 'doc_lines', 'notes', 'transaction_assignees']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `transaction_id=eq.${id}` }, onRemoteChange)
    }
    channel.subscribe()
    return () => { supabase!.removeChannel(channel) }
  }, [id])

  function refreshFromRemote() {
    loadAll()
    setRemoteUpdate(false)
  }

  async function toggleAssignee(memberId: string) {
    justSavedRef.current = Date.now()
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
    justSavedRef.current = Date.now()
    setAssignedIds((cur) => new Set(cur).add(memberId))
    if (DEMO_MODE || !supabase || !id) return
    await supabase.from('transaction_assignees')
      .insert({ transaction_id: id, team_member_id: memberId })
  }

  function patch(fn: (d: SharedPayload) => SharedPayload) {
    setData((cur) => (cur ? fn(structuredClone(cur)) : cur))
  }

  async function write(table: string, rowId: string, values: Record<string, unknown>) {
    justSavedRef.current = Date.now()
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

    onRemoveMilestone: (m: Milestone) => {
      patch((d) => ({ ...d, milestones: d.milestones.filter((x) => x.id !== m.id) }))
      setHiddenMilestones((cur) => [...cur, m])
      write('milestones', m.id, { internal_only: true })
    },

    // Puts it back exactly where it was, checkmark and date included.
    onRestoreMilestone: (m: Milestone) => {
      setHiddenMilestones((cur) => cur.filter((x) => x.id !== m.id))
      patch((d) => ({ ...d, milestones: [...d.milestones, m] }))
      write('milestones', m.id, { internal_only: false })
    },

    onAddMilestone: async (side: Side, label: string, hasDate: boolean, afterId: string | null) => {
      if (!data || !id) return
      justSavedRef.current = Date.now()
      // Every row on this side, removed ones too, so the new step can't
      // collide with a removed step's spot if that one is put back later.
      const all = [...data.milestones, ...hiddenMilestones].filter((m) => m.side === side)
      const after = afterId ? all.find((m) => m.id === afterId) : null
      let order: number
      const bumps: Milestone[] = []
      if (!after) {
        order = Math.min(0, ...all.map((m) => m.sort_order)) - 10
      } else {
        order = after.sort_order + 1
        // Templates are usually spaced out, but if the next number is taken,
        // shift everything from there down by one to make room.
        if (all.some((m) => m.sort_order === order)) {
          for (const m of all) if (m.sort_order >= order) bumps.push(m)
        }
      }
      const bump = (list: Milestone[]) => list.map((m) =>
        bumps.some((b) => b.id === m.id) ? { ...m, sort_order: m.sort_order + 1 } : m)
      setHiddenMilestones((cur) => bump(cur))
      patch((d) => ({ ...d, milestones: bump(d.milestones) }))
      for (const b of bumps) write('milestones', b.id, { sort_order: b.sort_order + 1 })

      const fresh: Milestone = {
        id: `local-${Date.now()}`, side, label, has_date: hasDate, date_value: null,
        is_complete: false, sort_order: order, is_rail_step: false, rail_label: null,
      }
      if (DEMO_MODE || !supabase) {
        patch((d) => ({ ...d, milestones: [...d.milestones, fresh] }))
        return
      }
      const { data: row, error } = await supabase.from('milestones')
        .insert({ transaction_id: id, side, label, has_date: hasDate, sort_order: order })
        .select('*').single()
      if (error || !row) {
        console.error('milestone insert failed', error)
        alert('That step didn’t save. Please try again.')
        return
      }
      patch((d) => ({ ...d, milestones: [...d.milestones, row as Milestone] }))
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
      // Picking "Cancelled" (or picking anything else on a cancelled deal) in
      // the status dropdown does exactly what the buttons do, client
      // questions included.
      const wasCancelled = data?.transaction.status === 'fell_through'
      if (values.status === 'fell_through' && !wasCancelled) { cancelTransaction(true); return }
      if (values.status && values.status !== 'fell_through' && wasCancelled) { reactivateTransaction(values.status); return }
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
      justSavedRef.current = Date.now()
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

    onEditNote: (noteId: string, body: string) => {
      patch((d) => ({ ...d, notes: d.notes.map((n) => (n.id === noteId ? { ...n, body } : n)) }))
      write('notes', noteId, { body })
    },

    onDeleteNote: async (noteId: string) => {
      justSavedRef.current = Date.now()
      patch((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== noteId) }))
      if (DEMO_MODE || !supabase) return
      const { error } = await supabase.from('notes').delete().eq('id', noteId)
      if (error) alert(`Couldn't delete it: ${error.message}`)
    },

    onRenameMilestone: (m: Milestone, label: string) => {
      patch((d) => ({ ...d, milestones: d.milestones.map((x) => (x.id === m.id ? { ...x, label } : x)) }))
      write('milestones', m.id, { label })
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
    // already gave up. Returns whether it actually found anything, so the
    // "Look it up" button can tell her plainly instead of just doing nothing
    // visibly when a site blocks the lookup.
    onFetchListingPreview: async (url: string) => {
      if (DEMO_MODE || !supabase || !id) return false
      const { data: preview } = await supabase.functions.invoke('fetch-link-preview', { body: { url } })
      if (!preview) return false
      const values: Record<string, unknown> = {}
      if (preview.photo_url && !data?.transaction.photo_url) values.photo_url = preview.photo_url
      if (preview.hoa_fee) values.hoa_fee = preview.hoa_fee
      if (preview.property_tax) values.property_tax = preview.property_tax
      if (preview.school_district) values.school_district = preview.school_district
      if (preview.county) values.county = preview.county
      if (Object.keys(values).length === 0) return false
      patch((d) => ({ ...d, transaction: { ...d.transaction, ...values } }))
      write('transactions', id, values)
      return true
    },

    // Fallback for when the listing link is blocked (or there isn't one at
    // all) — searches the open web for the address instead of paying for a
    // property-data API. Still best-effort: county tax pages in particular
    // vary a lot in format, so this often finds less than fetch-link-preview
    // would from a cooperative listing site.
    onSearchHomeFacts: async () => {
      if (DEMO_MODE || !supabase || !id || !data) return { found: false, sourceUrl: null }
      const address = `${data.transaction.address_line} ${data.transaction.city_state_zip}`.trim()
      if (!address) return { found: false, sourceUrl: null }
      const { data: result } = await supabase.functions.invoke('search-home-facts', { body: { address } })
      if (!result) return { found: false, sourceUrl: null }
      const values: Record<string, unknown> = {}
      if (result.hoa_fee) values.hoa_fee = result.hoa_fee
      if (result.property_tax) values.property_tax = result.property_tax
      if (result.school_district) values.school_district = result.school_district
      if (result.county) values.county = result.county
      if (Object.keys(values).length === 0) return { found: false, sourceUrl: null }
      patch((d) => ({ ...d, transaction: { ...d.transaction, ...values } }))
      write('transactions', id, values)
      return { found: true, sourceUrl: result.source_url ?? null }
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
      justSavedRef.current = Date.now()
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
      justSavedRef.current = Date.now()
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

  // Cancelling keeps everything on the deal (notes, contacts, checklists) —
  // it's just the "Cancelled" status, which takes it off the main
  // Transactions list. Not archived_at: get_shared_transaction refuses
  // archived deals, so an archived one couldn't even be opened here again.
  // The client's file is freed up too, so "Convert to transaction" works
  // for their next deal; this one stays in their Deal history.
  async function cancelTransaction(alreadyChosen = false) {
    if (!id || !data) return
    if (!alreadyChosen && !confirm('Cancel this transaction? It moves off your main list into "Cancelled." Nothing on it is deleted, and you can make it active again any time.')) return
    patch((d) => ({ ...d, transaction: { ...d.transaction, status: 'fell_through' } }))
    await write('transactions', id, { status: 'fell_through' })
    if (DEMO_MODE || !supabase) {
      const buyer = data.contacts.find((c) => c.role_label === 'Buyers' || c.role_label === 'Sellers')
      setFollowUp({ leadId: 'demo', name: buyer?.name || 'This client', step: 'active' })
      return
    }
    // Found through Deal history, not the file's "current deal" pointer:
    // cancelling clears that pointer, so a deal cancelled, made active and
    // cancelled again would otherwise lose track of its client.
    const leads = await linkedClientFiles(id)
    // Only free up a file that's still on this deal (or on none). One that
    // has already moved on to a newer deal is left alone.
    const ours = leads.filter((l) => !l.converted_transaction_id || l.converted_transaction_id === id)
    for (const l of ours) {
      if (!l.converted_transaction_id) continue
      const { error } = await supabase.rpc('reactivate_lead', { p_lead_id: l.id })
      if (error) console.error('reactivate_lead failed', error)
    }
    // Then ask what's next for the client, so their file and a new deal (if
    // any) get set up right here instead of in three other places.
    const lead = ours[0]
    if (lead) setFollowUp({ leadId: lead.id, name: lead.full_name || 'This client', step: 'active' })
  }

  /** A private, dated line in the client file's "Personal details" — never
   *  the Updates board, which the client sees and gets emailed about. */
  async function logOnClientFile(leadId: string, text: string) {
    if (DEMO_MODE || !supabase) return
    const { count } = await supabase.from('lead_personal_notes')
      .select('id', { count: 'exact', head: true }).eq('lead_id', leadId)
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const { error } = await supabase.from('lead_personal_notes')
      .insert({ lead_id: leadId, text, date_value: dateStr, sort_order: count ?? 0 })
    if (error) console.error('personal note insert failed', error)
  }

  const cancelledAddress = data?.transaction.address_line || 'the previous property'

  async function answerNotActive() {
    if (!followUp) return
    await logOnClientFile(followUp.leadId, `Contract on ${cancelledAddress} cancelled. Not actively looking right now.`)
    // Moves them to the Nurture column (needs migration 079; without it the
    // update is refused and they simply stay in Upcoming).
    let nurtured = false
    if (!DEMO_MODE && supabase) {
      const { error } = await supabase.from('leads').update({ lead_status: 'nurture' }).eq('id', followUp.leadId)
      nurtured = !error
    }
    setFollowUp({ ...followUp, step: 'done', doneText: nurtured
      ? `${followUp.name} moved to Nurture on the Clients page, with a note on their file. Set a follow-up date there so they don't slip through.`
      : `Noted on ${followUp.name}'s file that they're not actively looking right now. Their file is still on the Clients page. Nothing was hidden or deleted.` })
  }

  async function answerStillLooking() {
    if (!followUp) return
    await logOnClientFile(followUp.leadId, `Contract on ${cancelledAddress} cancelled. Still active, looking for a new home.`)
    setFollowUp({ ...followUp, step: 'done', doneText: `${followUp.name} is back in Upcoming on the Clients page, ready for when they find the next home.` })
  }

  async function startNewDeal(values: { address: string; cityStateZip: string; listingUrl: string }) {
    if (!followUp || startingNew) return
    if (DEMO_MODE || !supabase) { setFollowUp(null); return }
    setStartingNew(true)
    const { data: newId, error } = await supabase.rpc('convert_lead_to_transaction', {
      p_lead_id: followUp.leadId, p_home_id: null,
    })
    if (error || !newId) {
      setStartingNew(false)
      alert(error?.message ?? 'Could not start the new transaction.')
      return
    }
    await supabase.from('transactions').update({
      address_line: values.address,
      city_state_zip: values.cityStateZip || null,
      listing_url: values.listingUrl || null,
    }).eq('id', newId)
    await logOnClientFile(followUp.leadId, `Contract on ${cancelledAddress} cancelled. Moved on to ${values.address}.`)
    setStartingNew(false)
    setFollowUp(null)
    nav(`/admin/t/${newId}`)
  }

  async function reactivateTransaction(nextStatus: TxStatus = 'under_contract') {
    if (!id) return
    setFollowUp(null)
    patch((d) => ({ ...d, transaction: { ...d.transaction, status: nextStatus } }))
    await write('transactions', id, { status: nextStatus })
    if (DEMO_MODE || !supabase) return
    // Undo what cancelling did to the client file: point it back at this deal,
    // unless it has since moved on to a different one.
    for (const l of await linkedClientFiles(id)) {
      if (l.converted_transaction_id) continue
      const { error } = await supabase.from('leads')
        .update({ converted_transaction_id: id, lead_status: 'under_contract' }).eq('id', l.id)
      if (error) console.error('relink lead failed', error)
    }
  }

  /** Every client file that has this deal in its Deal history. */
  async function linkedClientFiles(txId: string) {
    if (!supabase) return []
    const { data: history } = await supabase.from('lead_transactions')
      .select('lead_id').eq('transaction_id', txId)
    const leadIds = (history ?? []).map((h) => h.lead_id as string)
    if (!leadIds.length) return []
    const { data: leads } = await supabase.from('leads')
      .select('id, full_name, converted_transaction_id').in('id', leadIds)
    return (leads ?? []) as Array<{ id: string; full_name: string | null; converted_transaction_id: string | null }>
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
      {remoteUpdate && (
        <div className="updatebar">
          This transaction was updated elsewhere.
          <button type="button" className="btn" onClick={refreshFromRemote}>Refresh</button>
          <button type="button" className="btn" onClick={() => setRemoteUpdate(false)}>Dismiss</button>
        </div>
      )}
      <div className="admin" style={{ paddingTop: 16, paddingBottom: 0 }}>
        <AdminNav current="transactions" />
        {!desk && <AssignedTo roster={roster} assignedIds={assignedIds} onToggle={toggleAssignee} />}
        {(!desk || data.transaction.status === 'fell_through') && (
        <div className="card setcard" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 10,
        }}>
          {data.transaction.status === 'fell_through' ? (
            <>
              <span style={{ fontWeight: 700, color: 'var(--danger, #cc3311)' }}>
                ✕ Cancelled — this deal is inactive. Everything on it is still saved.
              </span>
              <button className="btn" onClick={() => reactivateTransaction()}>Make active again</button>
            </>
          ) : data.transaction.closed_and_funded ? (
            <>
              <span style={{ fontWeight: 700, color: '#2ecc40' }}>
                ✓ Closed &amp; funded {data.transaction.closed_and_funded_date &&
                  `on ${new Date(data.transaction.closed_and_funded_date + 'T00:00:00').toLocaleDateString()}`}
              </span>
              <button className="btn" onClick={markClosed}>Edit date</button>
            </>
          ) : (
            <>
              <span className="muted" style={{ fontSize: 15.5 }}>
                Once funds have disbursed, mark this closed to move the client's file to Closed.
              </span>
              <span style={{ display: 'flex', gap: 9 }}>
                <button className="btn" onClick={() => cancelTransaction()}>Cancel transaction</button>
                <button className="btn primary" onClick={markClosed}>Closed &amp; Funded</button>
              </span>
            </>
          )}
        </div>
        )}
      </div>
      {followUp && (
        <div className="admin" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <CancelFollowUp
            followUp={followUp}
            busy={startingNew}
            onNotActive={answerNotActive}
            onActive={() => setFollowUp({ ...followUp, step: 'newProperty' })}
            onStillLooking={answerStillLooking}
            onNewProperty={() => setFollowUp({ ...followUp, step: 'address' })}
            onStartNew={startNewDeal}
            onClose={() => setFollowUp(null)}
          />
        </div>
      )}
      <Dashboard
        data={data}
        editable
        roster={roster}
        savedContacts={savedContacts}
        contactSuggestions={contactSuggestions}
        internalContacts={internalContacts}
        hiddenMilestones={hiddenMilestones}
        deskActions={
          <>
            <button className="btn" onClick={copyLink}>{copied ? 'Copied' : 'Copy client link'}</button>
            {data.transaction.status === 'fell_through' ? (
              <button className="btn" onClick={() => reactivateTransaction()}>Make active again</button>
            ) : data.transaction.closed_and_funded ? (
              <button className="btn" onClick={markClosed} title="Change the closed & funded date">
                ✓ Closed {data.transaction.closed_and_funded_date &&
                  new Date(data.transaction.closed_and_funded_date + 'T00:00:00').toLocaleDateString()}
              </button>
            ) : (
              <>
                <button className="btn primary" onClick={markClosed}>Closed &amp; Funded</button>
                <button className="btn" onClick={() => cancelTransaction()}>Cancel transaction</button>
              </>
            )}
          </>
        }
        deskSide={<AssignedTo compact roster={roster} assignedIds={assignedIds} onToggle={toggleAssignee} />}
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

interface FollowUp {
  leadId: string
  name: string
  step: 'active' | 'newProperty' | 'address' | 'done'
  doneText?: string
}

/**
 * Asked right after a deal is cancelled: is the client still active, and
 * have they started on a new property? Each answer updates their client
 * file; "new property" also starts the new transaction from their file.
 */
function CancelFollowUp({ followUp, busy, onNotActive, onActive, onStillLooking, onNewProperty, onStartNew, onClose }: {
  followUp: FollowUp
  busy: boolean
  onNotActive: () => void
  onActive: () => void
  onStillLooking: () => void
  onNewProperty: () => void
  onStartNew: (v: { address: string; cityStateZip: string; listingUrl: string }) => void
  onClose: () => void
}) {
  const [address, setAddress] = useState('')
  const [cityStateZip, setCityStateZip] = useState('')
  const [listingUrl, setListingUrl] = useState('')
  const q = { fontSize: 19, fontWeight: 700, textTransform: 'none' as const, letterSpacing: 'normal', color: 'var(--ink)', margin: '0 0 6px' }
  const row = { display: 'flex', flexWrap: 'wrap' as const, gap: 9, marginTop: 14 }

  return (
    <div className="card setcard" style={{ borderColor: 'var(--gold-soft)', background: 'rgba(201,164,76,0.06)' }}>
      {followUp.step === 'active' && (
        <>
          <h2 style={q}>Is {followUp.name} still an active client?</h2>
          <p className="sethelp">This updates their client file to match.</p>
          <div style={row}>
            <button className="btn primary" onClick={onActive}>Yes, still active</button>
            <button className="btn" onClick={onNotActive}>No, not right now</button>
          </div>
        </>
      )}
      {followUp.step === 'newProperty' && (
        <>
          <h2 style={q}>Have they started on a new property?</h2>
          <div style={row}>
            <button className="btn primary" onClick={onNewProperty}>Yes, a new property</button>
            <button className="btn" onClick={onStillLooking}>Not yet, still looking</button>
          </div>
        </>
      )}
      {followUp.step === 'address' && (
        <form onSubmit={(e) => {
          e.preventDefault()
          if (address.trim()) onStartNew({ address: address.trim(), cityStateZip: cityStateZip.trim(), listingUrl: listingUrl.trim() })
        }}>
          <h2 style={q}>What's the new property?</h2>
          <p className="sethelp">
            This starts a new transaction from {followUp.name}'s client file. Their
            agent, name, phone and email carry over, and this cancelled deal stays in their Deal history.
          </p>
          <div className="field">
            <label>Street address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" autoFocus />
          </div>
          <div className="field">
            <label>City, state, zip</label>
            <input value={cityStateZip} onChange={(e) => setCityStateZip(e.target.value)} placeholder="Orlando, FL 32801" />
          </div>
          <div className="field">
            <label>Listing link (optional)</label>
            <input value={listingUrl} onChange={(e) => setListingUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div style={row}>
            <button className="btn primary" type="submit" disabled={busy || !address.trim()}>
              {busy ? 'Starting…' : 'Start new transaction'}
            </button>
            <button className="btn" type="button" onClick={onClose}>Skip for now</button>
          </div>
        </form>
      )}
      {followUp.step === 'done' && (
        <>
          <h2 style={q}>Client file updated</h2>
          <p className="sethelp">{followUp.doneText}</p>
          <div style={row}>
            <Link className="btn primary" to={`/admin/leads/${followUp.leadId}`}>Open their client file</Link>
            <button className="btn" onClick={onClose}>Done</button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Who's on this deal. Click a chip to add or remove someone from your roster
 * (Settings › Team) — this is what limits their view to just their own deals
 * once they're the ones logged in.
 */
function AssignedTo({ roster, assignedIds, onToggle, compact }: {
  roster: TeamMember[]; assignedIds: Set<string>; onToggle: (id: string) => void
  /** Desk layout: just the chips, inside the "On this deal" card. */
  compact?: boolean
}) {
  // Rarely changed, so on the stacked layout it's one line until she clicks
  // Change (the desk layout folds the whole "On this deal" card instead).
  const [open, setOpen] = useState(false)
  if (roster.length === 0) return null
  if (!compact && !open) {
    const names = roster.filter((m) => assignedIds.has(m.id) || m.sees_all_transactions)
      .map((m) => m.full_name || 'Unnamed')
    return (
      <div className="card setcard" style={{ marginBottom: 16, display: 'flex', alignItems: 'center',
                                             justifyContent: 'space-between', gap: 12, padding: '12px 18px' }}>
        <span style={{ fontSize: 15.5, color: 'var(--ink-dim)', minWidth: 0 }}>
          <strong>Assigned to:</strong> {names.length ? names.join(', ') : 'no one yet'}
        </span>
        <button type="button" className="btn" style={{ flex: 'none' }} onClick={() => setOpen(true)}>Change</button>
      </div>
    )
  }
  return (
    <div className={compact ? undefined : 'card setcard'} style={compact ? { marginTop: 14 } : { marginBottom: 16 }}>
      {compact
        ? <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-dim)', marginBottom: 8 }}>Who can see this deal</div>
        : <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <h2>Assigned to</h2>
            <button type="button" className="btn" onClick={() => setOpen(false)}>Done</button>
          </div>}
      <p className="sethelp" style={{ marginBottom: 12, ...(compact ? { display: 'none' } : {}) }}>
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
                fontSize: compact ? 13.5 : 14.5, letterSpacing: '.02em',
                border: `1px solid ${on ? 'var(--gold-soft)' : 'var(--line)'}`,
                borderRadius: 999, padding: '6px 12px',
                color: on ? 'var(--gold-bright)' : 'var(--ink-faint)',
                background: 'none', flex: 'none',
                cursor: m.sees_all_transactions ? 'default' : 'pointer',
              }}
            >
              {m.full_name || 'Unnamed'}
              {!compact && m.roles.length > 0 && ` · ${m.roles.map((r) => ROLE_LABEL[r]).join(', ')}`}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** One entry per person (same name and phone), saved contacts first, keeping
 *  whichever copy has the most filled in. */
function buildSuggestions(saved: SavedContact[], onDeals: Contact[]): ContactSuggestion[] {
  const byKey = new Map<string, ContactSuggestion>()
  const score = (p: ContactSuggestion) => [p.phone, p.email, p.note, p.photo_url].filter(Boolean).length
  const rows: ContactSuggestion[] = [
    ...saved.map((s) => ({ name: s.name, role_label: s.role_label, phone: s.phone, email: s.email, note: null, photo_url: s.photo_url })),
    ...onDeals.map((c) => ({ name: c.name ?? '', role_label: c.role_label, phone: c.phone, email: c.email, note: c.note, photo_url: c.photo_url })),
  ]
  for (const p of rows) {
    const name = p.name.trim()
    if (!name) continue
    const key = `${name.toLowerCase()}|${(p.phone ?? '').replace(/\D/g, '')}`
    const cur = byKey.get(key)
    if (!cur || score({ ...p, name }) > score(cur)) byKey.set(key, { ...p, name })
  }
  return [...byKey.values()]
}
