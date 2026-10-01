import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { TeamMember } from '../lib/types'
import { useCanSeeHomePage } from '../lib/useCanSeeHomePage'
import { useIsDatabaseManager } from '../lib/useIsDatabaseManager'

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
      {items.map((it) => (
        it.key === current
          ? <span key={it.key} className="btn current" aria-current="page" style={{ opacity: .5, pointerEvents: 'none' }}>{it.label}</span>
          : <Link key={it.key} className="btn" to={it.to}>{it.label}</Link>
      ))}
      {!DEMO_MODE && (
        <button type="button" className="btn sidesignout" style={{ marginLeft: 'auto' }} onClick={signOut}>
          Sign out
        </button>
      )}
    </nav>
  )
}
