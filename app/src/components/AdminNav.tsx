import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { NetworkAgentStatus, TeamMember } from '../lib/types'
import { NETWORK_AGENT_STATUS_LABEL } from '../lib/types'
import { useIsDatabaseManager } from '../lib/useIsDatabaseManager'
import { useDeskLayout } from '../lib/useDeskLayout'
import mattheisLogo from '../assets/loan-sheet/mattheis-team.png'
import surekLogo from '../assets/loan-sheet/surek-group.png'

/**
 * Consistent quick-jump links shown at the top of every admin page, so
 * getting from a transaction to the Rolodex (say) doesn't mean clicking
 * back through the list first. Rolodex is hidden from anyone who doesn't
 * already see the whole book — same gate AdminList used before this
 * existed as its own component. Home Page (the old "Resources" page) shows
 * for a Database Manager always, and for anyone else only once a Database
 * Manager has granted them access to at least one folder on it (migration
 * 066) — see useCanSeeHomePage(). It's first in the list on purpose — it's
 * also where a Database Manager lands when they sign in, see AdminList.tsx.
 */
export default function AdminNav({ current }: {
  current: 'home' | 'transactions' | 'leads' | 'loans' | 'closed' | 'rolodex' | 'network' | 'resources' | 'settings'
}) {
  const [seesAllTransactions, setSeesAllTransactions] = useState(DEMO_MODE)
  const isDatabaseManager = useIsDatabaseManager()
  const canSeeRolodex = seesAllTransactions || isDatabaseManager
  const nav = useNavigate()
  const location = useLocation()
  const desk = useDeskLayout()
  const fileLists = useSideFileLists(desk)
  const brand = useMyBrand()

  async function signOut() {
    if (DEMO_MODE || !supabase) return
    cachedBrand = null
    await supabase.auth.signOut()
    nav('/login')
  }

  useEffect(() => {
    if (DEMO_MODE || !supabase) return
    supabase.auth.getUser().then(async ({ data: auth }) => {
      if (!auth.user) return
      const { data: members } = await supabase!.from('team_members').select('*')
      const mine = (members as TeamMember[] | null)?.find((m) => m.profile_id === auth.user!.id)
      setSeesAllTransactions(Boolean(mine?.sees_all_transactions))
    })
  }, [])

  const items: { key: typeof current; label: string; to: string }[] = [
    // My Home first: everyone's own landing page (2026-10-01). The Resource
    // Library shows for everyone now too, since each person has private
    // "My files" there (086); shared folders inside it are still decided by
    // RLS, not by this menu.
    { key: 'home', label: 'My Home', to: '/admin/home' },
    { key: 'resources', label: 'Resource Library', to: '/admin/resources' },
    { key: 'transactions', label: 'Transactions', to: '/admin' },
    { key: 'leads', label: 'Clients', to: '/admin/leads' },
    { key: 'loans', label: 'Loan Clients', to: '/admin/loans' },
    { key: 'closed', label: 'Closed', to: '/admin/closed' },
    ...(canSeeRolodex ? [{ key: 'rolodex' as const, label: 'Rolodex', to: '/admin/rolodex' }] : []),
    { key: 'network', label: 'Agent Recruiting', to: '/admin/network' },
    { key: 'settings', label: 'Settings', to: '/admin/settings' },
  ]

  // One menu, two looks: a row of buttons on a phone or small window, and a
  // fixed menu down the left side on a computer (the .sidenav rules in
  // theme.css). Every admin page gets the side menu the same way.
  return (
    <nav className="sidenav" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--line-soft)', marginBottom: 18 }}>
      {brand?.logo
        ? <span className="sidebrand logo"><img src={brand.logo} alt={brand.name} /></span>
        : <span className="sidebrand">{brand ? brand.name : '\u00a0'}</span>}
      {items.map((it) => {
        const link = it.key === current
          ? <span key={it.key} className="btn current" aria-current="page" style={{ opacity: .5, pointerEvents: 'none' }}>{it.label}</span>
          : <Link key={it.key} className="btn" to={it.to}>{it.label}</Link>
        const files = desk && fileLists ? fileLists[it.key as FileListKey] : undefined
        if (!files) return link
        return <SideGroup key={it.key} groupKey={it.key} link={link} files={files}
                          defaultOpen={it.key === current} activePath={location.pathname} />
      })}
      {!DEMO_MODE && (
        <button type="button" className="btn sidesignout" style={{ marginLeft: 'auto' }} onClick={signOut}>
          Sign out
        </button>
      )}
    </nav>
  )
}

/* ------------------------------------------------------- top-left logo */

// Each person's own logo at the top left (Allison, 2026-10-01): their menu
// logo from Settings › Team (migration 085), else the bundled one for
// Allison (The Mattheis Team) and Rich (The Surek Group), else their name.
let cachedBrand: { logo: string | null; name: string } | null = null
function useMyBrand() {
  const [brand, setBrand] = useState(cachedBrand ?? (DEMO_MODE ? { logo: mattheisLogo, name: 'The Mattheis Team' } : null))
  useEffect(() => {
    if (cachedBrand || DEMO_MODE || !supabase) return
    ;(async () => {
      const { data: auth } = await supabase!.auth.getUser()
      if (!auth.user) return
      const { data } = await supabase!.from('team_members').select('*').eq('profile_id', auth.user.id)
      const rows = (data as TeamMember[] | null) ?? []
      const mine = rows.find((m) => m.brand_logo_url) ?? rows[0]
      const name = (mine?.full_name || '').toLowerCase()
      const email = (auth.user.email || '').toLowerCase()
      const bundled = name.includes('surek') ? surekLogo
        : name.includes('mattheis') && name.includes('allison') || email === 'allisonsellsflorida@gmail.com' ? mattheisLogo
        : null
      cachedBrand = { logo: mine?.brand_logo_url || bundled, name: mine?.full_name || 'Mattheis & Co.' }
      setBrand(cachedBrand)
    })()
  }, [])
  return brand
}

/* ------------------------------------------------------- side menu lists */

type FileListKey = 'resources' | 'transactions' | 'leads' | 'loans' | 'closed' | 'rolodex' | 'network' | 'settings'
interface SideFile {
  id: string; label: string
  /** In-app page to open… */
  to?: string
  /** …or a file/link to open in a new tab (Resource Library documents). */
  href?: string
  /** Second line of small text: a contact's role, a document's folder. */
  sub?: string
}
type FileLists = Partial<Record<FileListKey, SideFile[]>>

const SETTINGS_ITEMS: SideFile[] = [
  { id: 'branding', label: 'Branding', to: '/admin/settings?tab=branding' },
  { id: 'checklists', label: 'Checklists', to: '/admin/settings?tab=checklists' },
  { id: 'team', label: 'Team', to: '/admin/settings?tab=team' },
  { id: 'network', label: 'Agent Recruiting', to: '/admin/settings?tab=network' },
]

// Kept between pages so the menu doesn't empty and refill on every click.
let cachedLists: FileLists | null = null

/**
 * What folds open under each title in the side menu (computer only).
 * Who sees what is decided by the database, not here: a transaction
 * coordinator (or anyone marked "sees every transaction") gets every deal
 * and client, everyone else only what they're assigned to (RLS, migrations
 * 023/077); Resource Library files follow folder access. Everything is
 * filtered to her own team because a platform admin can read every team.
 */
function useSideFileLists(enabled: boolean): FileLists | null {
  const [lists, setLists] = useState<FileLists | null>(cachedLists)
  useEffect(() => {
    if (!enabled) return
    if (DEMO_MODE || !supabase) {
      import('../lib/demoData').then((d) => {
        const deals = [d.DEMO_PAYLOAD, d.DEMO_SELLER].map((p) => ({
          id: p.transaction.id, label: p.transaction.address_line, to: `/admin/t/${p.transaction.id}`,
        }))
        const people = [d.DEMO_PAYLOAD, d.DEMO_SELLER].flatMap((p) => p.contacts)
          .filter((c) => c.name?.trim())
          .map((c) => ({ id: c.id, label: c.name!, sub: c.role_label, to: `/admin/rolodex?q=${encodeURIComponent(c.name!)}` }))
        cachedLists = { transactions: deals, leads: [], closed: [], rolodex: dedupePeople(people), settings: SETTINGS_ITEMS }
        setLists(cachedLists)
      })
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: auth } = await supabase!.auth.getUser()
      if (!auth.user) return
      const { data: me } = await supabase!.from('profiles').select('team_id').eq('id', auth.user.id).maybeSingle()
      if (!me?.team_id) return
      const team = me.team_id as string
      const [txs, leads, folders, docs, people, saved, agents] = await Promise.all([
        supabase!.from('transactions')
          .select('id, address_line, status, closed_and_funded, closed_and_funded_date, created_at')
          .eq('team_id', team).is('archived_at', null).order('created_at', { ascending: false }),
        supabase!.from('leads')
          .select('id, full_name, full_name_2, lead_status, phone, wants_loan')
          .eq('team_id', team).is('archived_at', null).not('lead_status', 'in', '(closed,inactive)').order('full_name'),
        supabase!.from('resource_folders').select('id, name, category, parent_folder_id')
          .eq('team_id', team).order('name'),
        supabase!.from('resources').select('id, title, file_name, file_url, url, folder_id')
          .eq('team_id', team).order('title'),
        supabase!.from('contacts').select('id, name, role_label, phone, transactions!inner(team_id)')
          .eq('transactions.team_id', team).not('name', 'is', null).limit(5000),
        supabase!.from('saved_contacts').select('id, name, role_label, phone').eq('team_id', team),
        supabase!.from('network_agents').select('id, full_name, status')
          .eq('team_id', team).is('archived_at', null).order('full_name'),
      ])
      if (cancelled) return

      const tx = (txs.data ?? []) as { id: string; address_line: string; status: string; closed_and_funded: boolean; closed_and_funded_date: string | null }[]
      const leadRows = (leads.data ?? []) as { id: string; full_name: string | null; full_name_2: string | null; phone: string | null; wants_loan?: boolean }[]
      const folderRows = (folders.data ?? []) as { id: string; name: string; parent_folder_id: string | null }[]
      const folderName = new Map(folderRows.map((f) => [f.id, f.name]))
      const docRows = (docs.data ?? []) as { id: string; title: string | null; file_name: string | null; file_url: string | null; url: string | null; folder_id: string | null }[]

      const next: FileLists = {
        transactions: tx.filter((t) => !t.closed_and_funded && t.status !== 'fell_through')
          .map((t) => ({ id: t.id, label: t.address_line || 'Untitled property', to: `/admin/t/${t.id}` })),
        closed: tx.filter((t) => t.closed_and_funded)
          .sort((a, b) => (b.closed_and_funded_date ?? '').localeCompare(a.closed_and_funded_date ?? ''))
          .slice(0, 25)
          .map((t) => ({ id: t.id, label: t.address_line || 'Untitled property', to: `/admin/t/${t.id}` })),
        leads: leadRows.map((l) => ({
          id: l.id,
          label: (l.full_name || 'Unnamed client') + (l.full_name_2 ? ` & ${l.full_name_2}` : ''),
          to: `/admin/leads/${l.id}`,
        })),
        loans: leadRows.filter((l) => l.wants_loan).map((l) => ({
          id: l.id,
          label: (l.full_name || 'Unnamed client') + (l.full_name_2 ? ` & ${l.full_name_2}` : ''),
          to: `/admin/leads/${l.id}`,
        })),
        // Folders first (open in the library), then every document and link
        // (opens the file itself in a new tab), with its folder underneath.
        resources: [
          ...folderRows.map((f) => ({
            id: `f-${f.id}`, label: `📁 ${f.name}`, to: `/admin/resources?folder=${f.id}`,
            sub: f.parent_folder_id ? `in ${folderName.get(f.parent_folder_id) ?? 'a folder'}` : undefined,
          })),
          ...docRows.map((r) => ({
            id: `r-${r.id}`, label: r.title || r.file_name || 'Untitled',
            ...(r.file_url || r.url ? { href: (r.file_url || r.url)! } : { to: '/admin/resources' }),
            sub: r.folder_id ? folderName.get(r.folder_id) : undefined,
          })),
        ],
        rolodex: dedupePeople([
          ...leadRows.filter((l) => l.full_name?.trim()).map((l) => ({ id: `l-${l.id}`, label: l.full_name!, sub: 'Client', phone: l.phone })),
          ...((people.data ?? []) as { id: string; name: string; role_label: string; phone: string | null }[])
            .map((c) => ({ id: `c-${c.id}`, label: c.name, sub: c.role_label, phone: c.phone })),
          ...((saved.data ?? []) as { id: string; name: string; role_label: string; phone: string | null }[])
            .map((c) => ({ id: `s-${c.id}`, label: c.name, sub: c.role_label, phone: c.phone })),
        ].map((p) => ({ ...p, to: `/admin/rolodex?q=${encodeURIComponent(p.label)}` }))),
        network: ((agents.data ?? []) as { id: string; full_name: string; status: NetworkAgentStatus }[])
          .map((a) => ({ id: a.id, label: a.full_name || 'Unnamed', sub: NETWORK_AGENT_STATUS_LABEL[a.status] ?? a.status,
                         to: `/admin/network/${a.id}` })),
        settings: SETTINGS_ITEMS,
      }
      cachedLists = next
      setLists(next)
    })()
    return () => { cancelled = true }
  }, [enabled])
  return lists
}

/** One entry per person (same name and phone), A–Z. */
function dedupePeople<T extends SideFile & { phone?: string | null }>(rows: T[]): SideFile[] {
  const seen = new Map<string, SideFile>()
  for (const r of rows) {
    const name = r.label.trim()
    if (!name) continue
    const key = `${name.toLowerCase()}|${(r.phone ?? '').replace(/\D/g, '')}`
    if (!seen.has(key)) seen.set(key, { id: r.id, label: name, sub: r.sub, to: r.to })
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/** One menu title with its items folded underneath, plus a search box once
 *  the list is long (always for the Rolodex). Open/closed is remembered per
 *  title in this browser. */
function SideGroup({ groupKey, link, files, defaultOpen, activePath }: {
  groupKey: string; link: React.ReactNode; files: SideFile[]; defaultOpen: boolean; activePath: string
}) {
  const storeKey = `sidenav-open-${groupKey}`
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(storeKey); if (v !== null) return v === '1' } catch { /* private mode */ }
    return defaultOpen
  })
  const [q, setQ] = useState('')
  function toggle() {
    setOpen((o) => {
      try { localStorage.setItem(storeKey, o ? '0' : '1') } catch { /* ignore */ }
      return !o
    })
  }
  const searchable = groupKey === 'rolodex' || files.length > 6
  const needle = q.trim().toLowerCase()
  const shown = needle
    ? files.filter((f) => f.label.toLowerCase().includes(needle) || (f.sub ?? '').toLowerCase().includes(needle))
    : files
  const current = activePath + (typeof window !== 'undefined' ? window.location.search : '')
  return (
    <div className="sidegroup">
      <div className="siderow">
        {link}
        <button type="button" className="sidecaret" onClick={toggle} aria-expanded={open}
                title={open ? 'Hide list' : `Show ${files.length}`}>
          <span className="sidecount">{files.length}</span>{open ? '▾' : '▸'}
        </button>
      </div>
      {open && (
        <div className="sidefiles">
          {searchable && (
            <input className="sidesearch" value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder={groupKey === 'rolodex' ? 'Search names…' : 'Search…'} />
          )}
          {shown.length === 0 && <span className="sidefile empty">{needle ? 'No match' : 'None right now'}</span>}
          {shown.map((f) => {
            const body = <>{f.label}{f.sub && <span className="sidesub">{f.sub}</span>}</>
            return f.href ? (
              <a key={f.id} href={f.href} target="_blank" rel="noreferrer" title={f.label} className="sidefile">{body}</a>
            ) : (
              <Link key={f.id} to={f.to ?? '/admin'} title={f.label}
                    className={`sidefile${current === f.to || activePath === f.to ? ' on' : ''}`}>{body}</Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
