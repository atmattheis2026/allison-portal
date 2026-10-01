import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { TeamMember } from '../lib/types'
import { useCanSeeHomePage } from '../lib/useCanSeeHomePage'
import { useIsDatabaseManager } from '../lib/useIsDatabaseManager'
import { useDeskLayout } from '../lib/useDeskLayout'

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
  current: 'transactions' | 'leads' | 'closed' | 'rolodex' | 'network' | 'resources' | 'settings'
}) {
  const [seesAllTransactions, setSeesAllTransactions] = useState(DEMO_MODE)
  const canSeeHomePage = useCanSeeHomePage()
  const isDatabaseManager = useIsDatabaseManager()
  const canSeeRolodex = seesAllTransactions || isDatabaseManager
  const nav = useNavigate()
  const location = useLocation()
  const desk = useDeskLayout()
  const fileLists = useSideFileLists(desk)

  async function signOut() {
    if (DEMO_MODE || !supabase) return
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
    ...(canSeeHomePage ? [{ key: 'resources' as const, label: 'Home Page', to: '/admin/resources' }] : []),
    { key: 'transactions', label: 'Transactions', to: '/admin' },
    { key: 'leads', label: 'Active Clients', to: '/admin/leads' },
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
      <span className="sidebrand">Mattheis &amp; Co.</span>
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

/* ------------------------------------------------------- side menu lists */

type FileListKey = 'transactions' | 'leads' | 'closed'
interface SideFile { id: string; label: string; to: string }
type FileLists = Record<FileListKey, SideFile[]>

// Kept between pages so the menu doesn't empty and refill on every click.
let cachedLists: FileLists | null = null

/**
 * The files under Transactions, Active Clients and Closed in the side menu.
 * Who sees what is decided by the database, not here: a transaction
 * coordinator (or anyone marked "sees every transaction") gets every file,
 * everyone else only the ones they're assigned to (RLS, migrations 023/077).
 * Filtered to her own team because a platform admin can read every team.
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
        cachedLists = { transactions: deals, leads: [], closed: [] }
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
      const [{ data: txs }, { data: leads }] = await Promise.all([
        supabase!.from('transactions')
          .select('id, address_line, status, closed_and_funded, closed_and_funded_date, created_at')
          .eq('team_id', me.team_id).is('archived_at', null)
          .order('created_at', { ascending: false }),
        supabase!.from('leads')
          .select('id, full_name, full_name_2, lead_status')
          .eq('team_id', me.team_id).is('archived_at', null).neq('lead_status', 'closed')
          .order('full_name'),
      ])
      if (cancelled) return
      const tx = (txs ?? []) as { id: string; address_line: string; status: string; closed_and_funded: boolean; closed_and_funded_date: string | null }[]
      const next: FileLists = {
        transactions: tx.filter((t) => !t.closed_and_funded && t.status !== 'fell_through')
          .map((t) => ({ id: t.id, label: t.address_line || 'Untitled property', to: `/admin/t/${t.id}` })),
        closed: tx.filter((t) => t.closed_and_funded)
          .sort((a, b) => (b.closed_and_funded_date ?? '').localeCompare(a.closed_and_funded_date ?? ''))
          .slice(0, 25)
          .map((t) => ({ id: t.id, label: t.address_line || 'Untitled property', to: `/admin/t/${t.id}` })),
        leads: ((leads ?? []) as { id: string; full_name: string | null; full_name_2: string | null }[])
          .map((l) => ({
            id: l.id,
            label: (l.full_name || 'Unnamed client') + (l.full_name_2 ? ` & ${l.full_name_2}` : ''),
            to: `/admin/leads/${l.id}`,
          })),
      }
      cachedLists = next
      setLists(next)
    })()
    return () => { cancelled = true }
  }, [enabled])
  return lists
}

/** One menu title with its files folded underneath. Open/closed is
 *  remembered per title in this browser. */
function SideGroup({ groupKey, link, files, defaultOpen, activePath }: {
  groupKey: string; link: React.ReactNode; files: SideFile[]; defaultOpen: boolean; activePath: string
}) {
  const storeKey = `sidenav-open-${groupKey}`
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(storeKey); if (v !== null) return v === '1' } catch { /* private mode */ }
    return defaultOpen
  })
  function toggle() {
    setOpen((o) => {
      try { localStorage.setItem(storeKey, o ? '0' : '1') } catch { /* ignore */ }
      return !o
    })
  }
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
          {files.length === 0 && <span className="sidefile empty">None right now</span>}
          {files.map((f) => (
            <Link key={f.id} to={f.to} title={f.label}
                  className={`sidefile${activePath === f.to ? ' on' : ''}`}>{f.label}</Link>
          ))}
        </div>
      )}
    </div>
  )
}
