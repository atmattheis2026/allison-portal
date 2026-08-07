import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import { DEMO_PAYLOAD, DEMO_SELLER, TEAM_MEMBERS, TRANSACTION_ASSIGNEES } from '../lib/demoData'
import { STATUS_LABEL, type DealType, type TeamMember, type TxStatus } from '../lib/types'
import './Admin.css'

interface Row {
  id: string
  address_line: string
  city_state_zip: string
  photo_url: string | null
  status: TxStatus
  deal_type: DealType
  closing_date: string | null
  share_token: string
}

const DEMO_ROWS: Row[] = [
  {
    id: 'demo-tx',
    address_line: DEMO_PAYLOAD.transaction.address_line,
    city_state_zip: DEMO_PAYLOAD.transaction.city_state_zip,
    photo_url: DEMO_PAYLOAD.transaction.photo_url,
    status: DEMO_PAYLOAD.transaction.status,
    deal_type: 'buy',
    closing_date: DEMO_PAYLOAD.transaction.closing_date,
    share_token: 'demo',
  },
  {
    id: 'demo-sell',
    address_line: DEMO_SELLER.transaction.address_line,
    city_state_zip: DEMO_SELLER.transaction.city_state_zip,
    photo_url: DEMO_SELLER.transaction.photo_url,
    status: DEMO_SELLER.transaction.status,
    deal_type: 'sell',
    closing_date: DEMO_SELLER.transaction.closing_date,
    share_token: 'demo-sell',
  },
]

export default function AdminList() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const nav = useNavigate()

  const [needsSetup, setNeedsSetup] = useState(false)
  const [roster, setRoster] = useState<TeamMember[]>([])
  const [assignedByTx, setAssignedByTx] = useState<Record<string, string[]>>({})
  const [canSeeRolodex, setCanSeeRolodex] = useState(false)

  useEffect(() => {
    if (DEMO_MODE || !supabase) {
      setRows(DEMO_ROWS)
      setRoster(TEAM_MEMBERS)
      setAssignedByTx(TRANSACTION_ASSIGNEES)
      return
    }

    async function load() {
      const { data: auth } = await supabase!.auth.getUser()
      if (!auth.user) { nav('/login'); return }

      // A brand-new project has a signed-in user with no workspace yet. Say so
      // plainly instead of showing an empty list that looks like a bug.
      const { data: me } = await supabase!.from('profiles')
        .select('team_id').eq('id', auth.user.id).maybeSingle()
      if (!me?.team_id) { setNeedsSetup(true); setRows([]); return }

      const { data, error } = await supabase!
        .from('transactions')
        .select('id,address_line,city_state_zip,photo_url,status,deal_type,closing_date,share_token')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
      if (error) console.error(error)
      setRows((data as Row[]) ?? [])

      // RLS already limits which transaction rows come back to whoever's
      // signed in, so this is just for the little "who's on it" chips per
      // row — not a second layer of access control.
      const { data: members } = await supabase!.from('team_members').select('*').order('sort_order')
      setRoster((members as TeamMember[]) ?? [])

      // The rolodex is meant for whoever already sees the whole book — an
      // office manager (Database Manager) or anyone with the "sees every
      // transaction" switch — not a per-agent tool.
      const mine = (members as TeamMember[] | null)?.find((m) => m.profile_id === auth.user!.id)
      setCanSeeRolodex(Boolean(mine?.sees_all_transactions || mine?.roles.includes('admin')))

      const { data: assignments } = await supabase!
        .from('transaction_assignees').select('transaction_id,team_member_id')
      const grouped: Record<string, string[]> = {}
      for (const a of assignments ?? []) {
        (grouped[a.transaction_id] ??= []).push(a.team_member_id)
      }
      setAssignedByTx(grouped)
    }
    load()
  }, [nav])

  function copyLink(token: string) {
    const url = `${window.location.origin}/t/${token}`
    navigator.clipboard.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied(null), 1800)
  }

  if (!rows) return <div className="centered"><div className="spinner" /></div>

  if (needsSetup) return <FirstRun onDone={() => window.location.reload()} />

  return (
    <div className="admin">
      {DEMO_MODE && (
        <div className="demobar">
          Demo data — no database connected yet. Nothing you change here is saved.
        </div>
      )}

      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 15 }}>Transactions</span>
        <nav className="adminnav">
          <Link className="btn" to="/admin/leads">Active Buyers</Link>
          {canSeeRolodex && <Link className="btn" to="/admin/rolodex">Rolodex</Link>}
          <Link className="btn" to="/admin/settings">Settings</Link>
          <button className="btn primary" onClick={() => setCreating(true)}>
            New transaction
          </button>
        </nav>
      </header>

      {creating && (
        <NewTransaction
          onCancel={() => setCreating(false)}
          onCreated={(newId) => nav(`/admin/t/${newId}`)}
        />
      )}

      {rows.length === 0 ? (
        <div className="centered">
          <div style={{ maxWidth: 360 }}>
            <p className="muted" style={{ lineHeight: 1.7 }}>
              No transactions yet. Create one and you’ll get a link you can text
              straight to your client.
            </p>
          </div>
        </div>
      ) : (
        <div className="txlist">
          {rows.map((r) => (
            <div className="txcard" key={r.id}>
              <Link to={`/admin/t/${r.id}`} className="txmain">
                <div className="txthumb">
                  {r.photo_url
                    ? <img src={r.photo_url} alt="" />
                    : <span className="muted" style={{ fontSize: 11 }}>No photo</span>}
                </div>
                <div className="txinfo">
                  <div className="txaddr">{r.address_line || 'Untitled property'}</div>
                  <div className="txcity">{r.city_state_zip}</div>
                  <div className="txmeta">
                    <span className={`tag${r.deal_type === 'sell' ? ' sell' : ''}`}>
                      {r.deal_type === 'sell' ? 'Listing' : r.deal_type === 'loan' ? 'Loan only' : 'Buyer'}
                    </span>
                    <span className="muted">{STATUS_LABEL[r.status]}</span>
                    {r.closing_date && <span className="muted">· Closes {r.closing_date}</span>}
                  </div>
                </div>
              </Link>
              <AssignedChips
                names={roster
                  .filter((m) => assignedByTx[r.id]?.includes(m.id))
                  .map((m) => m.full_name)}
              />
              <button className="btn" onClick={() => copyLink(r.share_token)}>
                {copied === r.share_token ? 'Copied' : 'Copy client link'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Small initials, one per person assigned to this deal — set from the transaction's own page. */
function AssignedChips({ names }: { names: string[] }) {
  if (names.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 4, flex: 'none' }} title={names.join(', ')}>
      {names.map((name) => {
        const initials = name.split(/\s+/).filter(Boolean).slice(0, 2)
          .map((w) => w[0]?.toUpperCase()).join('')
        return (
          <div key={name} style={{
            width: 26, height: 26, borderRadius: '50%', flex: 'none',
            border: '1px solid var(--gold-soft)', background: 'var(--panel-2)',
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--serif)', fontSize: 11, color: 'var(--gold)',
          }}>{initials || '·'}</div>
        )
      })}
    </div>
  )
}

/**
 * Shown once, the first time anyone signs in to a fresh database. Creates the
 * team, both brands, and every checklist template in one call.
 */
function FirstRun({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [company, setCompany] = useState('')
  const [yourName, setYourName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('claim_workspace', {
      p_team_name: company, p_your_name: yourName,
    })
    if (error) { setErr(error.message); setBusy(false); return }
    onDone()
  }

  async function join(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('join_team_with_code', {
      p_code: code, p_full_name: yourName,
    })
    if (error) { setErr(error.message); setBusy(false); return }
    onDone()
  }

  return (
    <div className="admin">
      <div className="card setcard" style={{ maxWidth: 560, margin: '48px auto' }}>
        <h2>One-time setup</h2>
        <p className="sethelp">
          This is the first time you’ve signed in.
        </p>

        <div className="tabs" style={{ marginBottom: 18 }}>
          <button type="button" className={`tab${mode === 'create' ? ' on' : ''}`}
                  onClick={() => setMode('create')}>
            Start a new workspace
          </button>
          <button type="button" className={`tab${mode === 'join' ? ' on' : ''}`}
                  onClick={() => setMode('join')}>
            I have an invite code
          </button>
        </div>

        {mode === 'create' ? (
          <form onSubmit={create}>
            <p className="sethelp">
              Two questions and you’re done — your checklists get set up automatically.
            </p>
            <div className="field">
              <label>Your real estate company name</label>
              <input value={company} required autoFocus
                     onChange={(e) => setCompany(e.target.value)}
                     placeholder="Mattheis & Co." />
              <p className="sethelp" style={{ margin: '6px 0 0' }}>
                This shows at the top of every page. You can change it later, and add
                your logo, in Settings.
              </p>
            </div>
            <div className="field">
              <label>Your name</label>
              <input value={yourName} required
                     onChange={(e) => setYourName(e.target.value)}
                     placeholder="Allison Mattheis" />
            </div>
            {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
            <div className="savebar">
              <button className="btn primary" disabled={busy}>
                {busy ? 'Setting up…' : 'Set up my workspace'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={join}>
            <p className="sethelp">
              Ask whoever runs your team for their invite code — it's in their
              Settings › Team page.
            </p>
            <div className="field">
              <label>Your name</label>
              <input value={yourName} required autoFocus
                     onChange={(e) => setYourName(e.target.value)}
                     placeholder="Marcus Webb" />
            </div>
            <div className="field">
              <label>Invite code</label>
              <input value={code} required
                     onChange={(e) => setCode(e.target.value.toUpperCase())}
                     placeholder="A1B2C3D4" style={{ textTransform: 'uppercase' }} />
            </div>
            {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
            <div className="savebar">
              <button className="btn primary" disabled={busy}>
                {busy ? 'Joining…' : 'Join the team'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/**
 * Creating a transaction is two questions: the address and whether she's
 * representing the buyer or the seller. Everything else gets stamped from her
 * templates by seed_transaction(), and she fills it in on the page itself.
 *
 * deal_type is immutable after creation because it decides which checklist got
 * copied in — switching it later would strand a half-finished list.
 */
function NewTransaction({ onCancel, onCreated }: {
  onCancel: () => void; onCreated: (id: string) => void
}) {
  const [address, setAddress] = useState('')
  const [cityStateZip, setCityStateZip] = useState('')
  const [dealType, setDealType] = useState<DealType>('buy')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (DEMO_MODE || !supabase) {
      setErr('There’s no database connected yet, so this can’t save a real transaction.')
      return
    }
    setBusy(true); setErr(null)

    const { data: me } = await supabase.from('profiles')
      .select('team_id').eq('id', (await supabase.auth.getUser()).data.user?.id).single()
    if (!me?.team_id) { setErr('Couldn’t work out which team you’re on.'); setBusy(false); return }

    const { data: tx, error } = await supabase.from('transactions')
      .insert({
        team_id: me.team_id,
        deal_type: dealType,
        address_line: address,
        city_state_zip: cityStateZip,
      })
      .select('id').single()

    if (error || !tx) { setErr(error?.message ?? 'Could not create it.'); setBusy(false); return }

    // Stamp the checklist, contacts and doc lines, then work out the rail.
    await supabase.rpc('seed_transaction', { p_transaction_id: tx.id })
    await supabase.rpc('apply_rail_steps', { p_transaction_id: tx.id })

    onCreated(tx.id)
  }

  return (
    <form className="card setcard newtx" onSubmit={create}>
      <h2>New transaction</h2>
      <p className="sethelp">
        Just the address to start. Everything else you fill in on the page itself.
      </p>

      <div className="field2">
        <div className="field">
          <label>Street address</label>
          <input value={address} autoFocus required
                 onChange={(e) => setAddress(e.target.value)}
                 placeholder="7859 Palmilla Ct" />
        </div>
        <div className="field">
          <label>City, State ZIP</label>
          <input value={cityStateZip}
                 onChange={(e) => setCityStateZip(e.target.value)}
                 placeholder="Reunion, FL 34747" />
        </div>
      </div>

      <div className="field">
        <label>Which side are you on?</label>
        <div className="tabs">
          <button type="button" className={`tab${dealType === 'buy' ? ' on' : ''}`}
                  onClick={() => setDealType('buy')}>
            Representing the buyer
          </button>
          <button type="button" className={`tab${dealType === 'sell' ? ' on' : ''}`}
                  onClick={() => setDealType('sell')}>
            It’s my listing
          </button>
          <button type="button" className={`tab${dealType === 'loan' ? ' on' : ''}`}
                  onClick={() => setDealType('loan')}>
            Loan only — no real estate side
          </button>
        </div>
        <p className="sethelp" style={{ margin: '8px 0 0' }}>
          This picks which checklist gets used, and it can’t be changed afterwards —
          so if you get it wrong, delete this one and start again.
        </p>
      </div>

      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}

      <div className="savebar">
        <button className="btn primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create it'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
