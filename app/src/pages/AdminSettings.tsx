import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import { TEAM_MEMBERS } from '../lib/demoData'
import { ROLE_LABEL, type BrandKind, type DealType, type Side, type TeamMember, type TeamRole } from '../lib/types'
import './Admin.css'

/**
 * Settings — the two screens Allison can use without anyone's help.
 *
 *  Branding   she uploads both company logos and sets each accent color
 *  Checklists she edits the buyer list and BUILDS the seller list herself
 *
 * These exist so the parts of the build that were blocked on her (logos, brand
 * rules, the seller workflow) became things she can do rather than things she
 * has to send someone.
 */
export default function AdminSettings() {
  const [tab, setTab] = useState<'branding' | 'checklists' | 'team'>('branding')

  return (
    <div className="admin">
      {DEMO_MODE && (
        <div className="demobar">
          Demo mode — no database connected yet, so nothing here saves.
        </div>
      )}

      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 15 }}>Settings</span>
        <nav className="adminnav">
          <Link className="btn" to="/admin">All transactions</Link>
        </nav>
      </header>

      <div className="tabs">
        <button className={`tab${tab === 'branding' ? ' on' : ''}`} onClick={() => setTab('branding')}>
          Branding
        </button>
        <button className={`tab${tab === 'checklists' ? ' on' : ''}`} onClick={() => setTab('checklists')}>
          Checklists
        </button>
        <button className={`tab${tab === 'team' ? ' on' : ''}`} onClick={() => setTab('team')}>
          Team
        </button>
      </div>

      {tab === 'branding' ? <Branding /> : tab === 'checklists' ? <Checklists /> : <Team />}
    </div>
  )
}

/* ============================================================ branding */

interface BrandForm {
  name: string
  wordmark_text: string
  logo_url: string | null
  logo_light_url: string | null
  accent_hex: string
  needs_light_background: boolean
  disclaimer_text: string
}

const BLANK: BrandForm = {
  name: '', wordmark_text: '', logo_url: null, logo_light_url: null,
  accent_hex: '#C9A44C', needs_light_background: false, disclaimer_text: '',
}

function Branding() {
  const [re, setRe] = useState<BrandForm>({
    ...BLANK, name: 'Mattheis & Co.', wordmark_text: 'MATTHEIS & CO.',
  })
  const [lend, setLend] = useState<BrandForm>({ ...BLANK, accent_hex: '#7F9CB8' })

  return (
    <div className="settings">
      <BrandCard
        kind="real_estate"
        title="Real Estate Company"
        help="This is the logo at the very top of every page, and its color is the
              main accent used across the whole portal."
        value={re} onChange={setRe}
      />
      <BrandCard
        kind="lending"
        title="Lending Company"
        help="This one appears on the Loan section only, with its own color, so the
              page reads as co-branded rather than one company speaking for both."
        value={lend} onChange={setLend}
      />
      <p className="sethelp" style={{ maxWidth: 620 }}>
        Upload a logo made for a <strong>dark background</strong> — usually the white
        or reversed version of your logo file. If your brokerage doesn’t allow its
        logo on dark, tick the box in that section and the top bar becomes a light
        band instead.
      </p>
    </div>
  )
}

function BrandCard({ kind, title, help, value, onChange }: {
  kind: BrandKind; title: string; help: string
  value: BrandForm; onChange: (b: BrandForm) => void
}) {
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<BrandForm>) => onChange({ ...value, ...patch })

  async function upload(file: File, field: 'logo_url' | 'logo_light_url') {
    if (DEMO_MODE || !supabase) {
      // Still show it, so she can see how it looks before the DB exists.
      set({ [field]: URL.createObjectURL(file) } as Partial<BrandForm>)
      return
    }
    setBusy(true)
    const path = `brands/${kind}-${field}-${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true })
    if (error) { console.error(error); setBusy(false); return }
    const { data } = supabase.storage.from('media').getPublicUrl(path)
    set({ [field]: data.publicUrl } as Partial<BrandForm>)
    setBusy(false)
  }

  return (
    <div className="card setcard">
      <h2>{title}</h2>
      <p className="sethelp">{help}</p>

      <div className="field2">
        <div className="field">
          <label>Company name</label>
          <input value={value.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="field">
          <label>Text to show if there’s no logo</label>
          <input value={value.wordmark_text}
                 onChange={(e) => set({ wordmark_text: e.target.value })} />
        </div>
      </div>

      <div className="field2">
        <div className="field">
          <label>Logo for dark backgrounds</label>
          <LogoDrop url={value.logo_url} busy={busy}
                    onFile={(f) => upload(f, 'logo_url')} />
        </div>
        <div className="field">
          <label>Logo for light backgrounds (optional)</label>
          <LogoDrop url={value.logo_light_url} busy={busy} light
                    onFile={(f) => upload(f, 'logo_light_url')} />
        </div>
      </div>

      <div className="field">
        <label>Accent color</label>
        <div className="swatchrow">
          <input type="color" value={value.accent_hex}
                 onChange={(e) => set({ accent_hex: e.target.value })} />
          <input value={value.accent_hex} style={{ maxWidth: 130 }}
                 onChange={(e) => set({ accent_hex: e.target.value })} />
          <span className="muted" style={{ fontSize: 12 }}>
            Use the exact hex from your brand guidelines.
          </span>
        </div>
      </div>

      <label className="checkline">
        <input type="checkbox" checked={value.needs_light_background}
               onChange={(e) => set({ needs_light_background: e.target.checked })} />
        <span className="cl">
          My brand rules don’t allow this logo on a dark background.
          {kind === 'real_estate' && ' (This switches the top bar to a light band.)'}
        </span>
      </label>

      <div className="field" style={{ marginTop: 16 }}>
        <label>Disclaimer for the bottom of the page</label>
        <textarea
          rows={4} value={value.disclaimer_text}
          onChange={(e) => set({ disclaimer_text: e.target.value })}
          placeholder={kind === 'real_estate'
            ? 'Paste your brokerage’s required wording here'
            : 'Paste your lender’s required wording here (NMLS, Equal Housing, etc.)'}
        />
        <p className="sethelp" style={{ margin: '8px 0 0' }}>
          Leave this blank until your {kind === 'real_estate' ? 'brokerage' : 'lender'} has
          approved the exact wording. Nothing shows at the bottom of the page while
          it’s empty, which is better than showing something that hasn’t been checked.
        </p>
      </div>

      <div className="savebar">
        <button className="btn primary" disabled={DEMO_MODE}>Save {title.toLowerCase()}</button>
        {DEMO_MODE && <span className="muted" style={{ fontSize: 12 }}>Saving needs the database connected.</span>}
      </div>
    </div>
  )
}

function LogoDrop({ url, onFile, busy, light }: {
  url: string | null; onFile: (f: File) => void; busy: boolean; light?: boolean
}) {
  return (
    <label className="logodrop" style={light && url ? { background: 'var(--ink)' } : undefined}>
      <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp"
             style={{ display: 'none' }}
             onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      {busy ? <div className="spinner" />
        : url ? <img src={url} alt="logo" />
        : <span>Click to upload<br />PNG or SVG</span>}
      {url && <span style={{ fontSize: 11 }}>Click to replace</span>}
    </label>
  )
}

/* ============================================================ checklists */

interface TemplateRow { id: string; label: string; has_date: boolean; sort_order: number }

let tmpId = 0
const newRow = (order: number): TemplateRow =>
  ({ id: `new-${++tmpId}`, label: '', has_date: false, sort_order: order })

const BUYER_RE = [
  ['Contract day', true], ['Earnest deposit', true], ['Inspection date', true],
  ['Inspection report & negotiations due', true], ['Appraisal date', true],
  ['Appraisal due', true], ['Estoppel complete', false], ['Survey date', true],
  ['Survey complete', false], ['Clear to close', false], ['Signing date', true],
  ['Final wire sent', false], ['Final walk through', false], ['Funded!!', false],
] as const

const BUYER_LOAN = [
  ['Application complete', false], ['Documentation on file', false],
  ['Preapproval complete', false], ['Initial disclosures complete', false],
  ['Lock rate', false], ['Order appraisal', false], ['Order title work', false],
  ['Homeowners insurance set', false], ['Submitted to underwriting', false],
  ['Cleared conditions', false], ['Final underwriting', false],
  ['Clear to close', false], ['Closing disclosure signed', true],
  ['Balance numbers with title & lender', false], ['Closing!', false],
] as const

/** Her listing checklist, texted 2026-08-06. Not a mirror of the buyer list —
 *  it starts before there's a contract and ends at 'Funded!'. */
const SELLER_RE = [
  ['Listing agreement', true], ['Photos', true], ['MLS go-live', true],
  ['Open house', true], ['Contract agreement', true], ['Earnest deposit due', true],
  ['Earnest deposit received', false], ['Inspection scheduled', true],
  ['Inspection due', true], ['Estoppel ordered and cleared', false],
  ['Appraisal scheduled', true], ['Appraisal due', true],
  ['Buyers clear to close', false], ['Provide utilities to buyer', false],
  ['Signing scheduled', true], ['Funded!', false],
] as const

function seedRows(src: readonly (readonly [string, boolean])[]): TemplateRow[] {
  return src.map(([label, has_date], i) => ({
    id: `seed-${i}-${label}`, label, has_date, sort_order: (i + 1) * 10,
  }))
}

function Checklists() {
  const [dealType, setDealType] = useState<DealType>('buy')
  const [side, setSide] = useState<Side>('real_estate')

  // Both lists come from her own texts. The seller loan side stays empty because
  // her listing checklist has no loan steps, which hides the whole Loan section
  // on listings.
  const [lists, setLists] = useState<Record<string, TemplateRow[]>>({
    'buy:real_estate': seedRows(BUYER_RE),
    'buy:loan': seedRows(BUYER_LOAN),
    'sell:real_estate': seedRows(SELLER_RE),
    'sell:loan': [],
  })

  const key = `${dealType}:${side}`
  const rows = lists[key] ?? []
  const setRows = (next: TemplateRow[]) => setLists({ ...lists, [key]: next })

  const update = (id: string, patch: Partial<TemplateRow>) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const remove = (id: string) => setRows(rows.filter((r) => r.id !== id))

  const add = () =>
    setRows([...rows, newRow((rows.at(-1)?.sort_order ?? 0) + 10)])

  const move = (id: string, dir: -1 | 1) => {
    const i = rows.findIndex((r) => r.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    setRows(next.map((r, k) => ({ ...r, sort_order: (k + 1) * 10 })))
  }

  return (
    <div className="settings">
      <div className="card setcard">
        <h2>Checklists</h2>
        <p className="sethelp">
          These are the master lists. Editing here changes what gets copied onto
          <strong> new</strong> transactions — it won’t rewrite deals already in progress,
          so nothing you have going right now will shift under you.
        </p>

        <div className="tabs">
          <button className={`tab${dealType === 'buy' ? ' on' : ''}`} onClick={() => setDealType('buy')}>
            Buyer
          </button>
          <button className={`tab${dealType === 'sell' ? ' on' : ''}`} onClick={() => setDealType('sell')}>
            Listing / Seller
          </button>
        </div>

        <div className="tabs">
          <button className={`tab${side === 'real_estate' ? ' on' : ''}`} onClick={() => setSide('real_estate')}>
            Real Estate side
          </button>
          <button className={`tab${side === 'loan' ? ' on' : ''}`} onClick={() => setSide('loan')}>
            Loan side
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="emptynote" style={{ padding: '28px 8px' }}>
            {dealType === 'sell' && side === 'loan' ? (
              <>
                Nothing here, on purpose.<br /><br />
                <span style={{ color: 'var(--ink-faint)' }}>
                  Your listing checklist doesn’t have any loan steps, so the Loan
                  section is hidden entirely on listings and the page runs two
                  columns instead of three. Add steps here only if you want a loan
                  section on your seller pages.
                </span>
              </>
            ) : 'Nothing here yet.'}
          </div>
        ) : (
          rows.map((r) => (
            <div className="tmplrow" key={r.id}>
              <button className="grip" onClick={() => move(r.id, -1)} title="Move up">↑</button>
              <button className="grip" onClick={() => move(r.id, 1)} title="Move down">↓</button>
              <input type="text" value={r.label} placeholder="Name this step"
                     onChange={(e) => update(r.id, { label: e.target.value })} />
              <button className={`datetoggle${r.has_date ? ' on' : ''}`}
                      title="Does this step have a date?"
                      onClick={() => update(r.id, { has_date: !r.has_date })}>
                {r.has_date ? 'Has date' : 'No date'}
              </button>
              <button className="del" onClick={() => remove(r.id)} title="Delete">×</button>
            </div>
          ))
        )}

        <div className="savebar">
          <button className="btn" onClick={add}>+ Add a step</button>
          <button className="btn primary" disabled={DEMO_MODE}>Save checklist</button>
          {DEMO_MODE && (
            <span className="muted" style={{ fontSize: 12 }}>
              Saving needs the database connected.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================================================ team */

let nextTeamId = 1000

function newMember(sort_order: number): TeamMember {
  return {
    id: `new-${nextTeamId++}`, full_name: '', roles: [],
    license_number: null, headshot_url: null, phone: null, email: null,
    sees_all_transactions: false, sort_order, profile_id: null,
  }
}

/**
 * Her roster, with the per-person switch she asked for: "Sees every transaction"
 * on means an office-manager type who can see the whole book. Off means they only
 * see deals they're assigned to on that deal's page — see AdminTransaction.
 */
function Team() {
  const [members, setMembers] = useState<TeamMember[]>(DEMO_MODE ? TEAM_MEMBERS : [])
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(DEMO_MODE ? 'DEMO1234' : null)
  const [copied, setCopied] = useState(false)
  const [inviteStatus, setInviteStatus] = useState<Record<string, 'sending' | 'sent' | 'error'>>({})

  async function sendInvite(memberId: string) {
    if (DEMO_MODE || !supabase) return
    setInviteStatus((s) => ({ ...s, [memberId]: 'sending' }))
    const { error } = await supabase.functions.invoke('send-team-invite', {
      body: { team_member_id: memberId },
    })
    setInviteStatus((s) => ({ ...s, [memberId]: error ? 'error' : 'sent' }))
    if (!error) setTimeout(() => setInviteStatus((s) => ({ ...s, [memberId]: undefined as never })), 3000)
  }

  useEffect(() => {
    if (DEMO_MODE || !supabase) return
    supabase.from('team_members').select('*').order('sort_order')
      .then(({ data }) => setMembers((data as TeamMember[]) ?? []))
    supabase.auth.getUser().then(async ({ data: auth }) => {
      const { data: me } = await supabase!.from('profiles')
        .select('team_id').eq('id', auth.user?.id).single()
      if (!me?.team_id) return
      const { data: team } = await supabase!.from('teams')
        .select('invite_code').eq('id', me.team_id).single()
      setInviteCode(team?.invite_code ?? null)
    })
  }, [])

  function copyCode() {
    if (!inviteCode) return
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const update = (id: string, patch: Partial<TeamMember>) =>
    setMembers(members.map((m) => (m.id === id ? { ...m, ...patch } : m)))

  const remove = (id: string) => {
    setMembers(members.filter((m) => m.id !== id))
    if (!id.startsWith('new-')) setRemovedIds([...removedIds, id])
  }

  const add = () =>
    setMembers([...members, newMember((members.at(-1)?.sort_order ?? 0) + 10)])

  async function uploadHeadshot(id: string, file: File) {
    const localUrl = URL.createObjectURL(file)
    update(id, { headshot_url: localUrl })
    if (DEMO_MODE || !supabase) return
    const path = `team/${id}-${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true })
    if (error) { console.error('headshot upload failed', error); return }
    const { data } = supabase.storage.from('media').getPublicUrl(path)
    update(id, { headshot_url: data.publicUrl })
  }

  async function save() {
    if (DEMO_MODE || !supabase) return
    setBusy(true)

    const { data: auth } = await supabase.auth.getUser()
    const { data: me } = await supabase.from('profiles')
      .select('team_id').eq('id', auth.user?.id).single()
    const teamId = me?.team_id
    if (!teamId) { setBusy(false); return }

    for (const id of removedIds) {
      await supabase.from('team_members').delete().eq('id', id)
    }
    setRemovedIds([])

    for (const m of members) {
      if (!m.full_name.trim()) continue
      const row = {
        team_id: teamId, full_name: m.full_name, roles: m.roles,
        license_number: m.license_number, headshot_url: m.headshot_url,
        phone: m.phone, email: m.email,
        sees_all_transactions: m.sees_all_transactions, sort_order: m.sort_order,
      }
      if (m.id.startsWith('new-')) {
        const { data } = await supabase.from('team_members').insert(row).select('id').single()
        if (data) update(m.id, { id: data.id })
      } else {
        await supabase.from('team_members').update(row).eq('id', m.id)
      }
    }

    setBusy(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className="settings">
      <div className="card setcard">
        <h2>Team</h2>
        <p className="sethelp">
          Everyone who works your transactions. Turn on <strong>Sees every transaction</strong>{' '}
          for people who should have the whole book — an office manager, or you.
          Leave it off for agents and loan officers, and pick which of their deals
          they're on from each transaction's page.
        </p>

        {inviteCode && (
          <div className="field" style={{
            background: 'var(--panel-2)', border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 18,
          }}>
            <label>Invite your team</label>
            <p className="sethelp" style={{ margin: '2px 0 10px' }}>
              Add someone below with their name and email first if you want their
              headshot and role ready to go. Then send them this: go to the app,
              sign in with their own email, choose "I have an invite code," and
              enter this code.
            </p>
            <div className="swatchrow">
              <div style={{
                fontFamily: 'var(--serif)', fontSize: 20, letterSpacing: '.08em',
                color: 'var(--gold-bright)', padding: '6px 14px',
                border: '1px solid var(--gold-soft)', borderRadius: 999,
              }}>
                {inviteCode}
              </div>
              <button type="button" className="btn" onClick={copyCode}>
                {copied ? 'Copied' : 'Copy code'}
              </button>
            </div>
          </div>
        )}

        {members.map((m) => (
          <div className="tmplrow" key={m.id} style={{ alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <label style={{ cursor: 'pointer', flex: 'none' }} title="Click to add a headshot">
              <input type="file" accept="image/*" style={{ display: 'none' }}
                     onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadHeadshot(m.id, f) }} />
              {m.headshot_url
                ? <img src={m.headshot_url} alt="" style={{
                    width: 32, height: 32, borderRadius: '50%', objectFit: 'cover',
                    border: '1px solid var(--gold-soft)',
                  }} />
                : <span style={{
                    width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    border: '1px dashed var(--line)', fontSize: 10, color: 'var(--ink-faint)',
                  }}>+</span>}
            </label>
            <input
              type="text" value={m.full_name} placeholder="Full name"
              style={{ minWidth: 160, flex: 1 }}
              onChange={(e) => update(m.id, { full_name: e.target.value })}
            />
            <input
              type="text" value={m.license_number ?? ''} placeholder="License / NMLS #"
              style={{ minWidth: 130, maxWidth: 150, flex: 'none' }}
              onChange={(e) => update(m.id, { license_number: e.target.value || null })}
            />
            <button
              className={`datetoggle${m.sees_all_transactions ? ' on' : ''}`}
              title="Sees every transaction on the team, not just their own"
              onClick={() => update(m.id, { sees_all_transactions: !m.sees_all_transactions })}
            >
              {m.sees_all_transactions ? 'Sees every transaction' : 'Sees only assigned'}
            </button>
            {!m.profile_id && !m.id.startsWith('new-') && (
              m.email ? (
                <button
                  type="button" className="btn" disabled={inviteStatus[m.id] === 'sending'}
                  onClick={() => sendInvite(m.id)}
                >
                  {inviteStatus[m.id] === 'sending' ? 'Sending…'
                    : inviteStatus[m.id] === 'sent' ? 'Invite sent!'
                    : inviteStatus[m.id] === 'error' ? 'Failed — try again'
                    : 'Send Invite'}
                </button>
              ) : (
                <span className="muted" style={{ fontSize: 11 }}>Add an email to invite</span>
              )
            )}
            <button className="del" onClick={() => remove(m.id)} title="Remove from team">×</button>
            <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4, marginLeft: 42 }}>
              <input
                type="email" value={m.email ?? ''} placeholder="Email — needed for their invite"
                style={{ minWidth: 200, flex: 1 }}
                onChange={(e) => update(m.id, { email: e.target.value || null })}
              />
              <input
                type="text" value={m.phone ?? ''} placeholder="Phone (optional)"
                style={{ minWidth: 150, maxWidth: 180, flex: 'none' }}
                onChange={(e) => update(m.id, { phone: e.target.value || null })}
              />
            </div>
            <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
              {(Object.keys(ROLE_LABEL) as TeamRole[]).map((r) => {
                const on = m.roles.includes(r)
                return (
                  <button
                    key={r}
                    className={`datetoggle${on ? ' on' : ''}`}
                    onClick={() => update(m.id, {
                      roles: on ? m.roles.filter((x) => x !== r) : [...m.roles, r],
                    })}
                  >
                    {ROLE_LABEL[r]}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div className="savebar">
          <button className="btn" onClick={add}>+ Add a team member</button>
          <button className="btn primary" disabled={DEMO_MODE || busy} onClick={save}>
            {busy ? 'Saving…' : saved ? 'Saved' : 'Save team'}
          </button>
          {DEMO_MODE && (
            <span className="muted" style={{ fontSize: 12 }}>
              Saving needs the database connected.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
