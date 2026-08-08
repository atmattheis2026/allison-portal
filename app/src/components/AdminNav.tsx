import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { TeamMember } from '../lib/types'

/**
 * Consistent quick-jump links shown at the top of every admin page, so
 * getting from a transaction to the Rolodex (say) doesn't mean clicking
 * back through the list first. Rolodex is hidden from anyone who doesn't
 * already see the whole book — same gate AdminList used before this
 * existed as its own component.
 */
export default function AdminNav({ current }: {
  current: 'transactions' | 'leads' | 'rolodex' | 'settings'
}) {
  const [canSeeRolodex, setCanSeeRolodex] = useState(DEMO_MODE)

  useEffect(() => {
    if (DEMO_MODE || !supabase) return
    supabase.auth.getUser().then(async ({ data: auth }) => {
      if (!auth.user) return
      const { data: members } = await supabase!.from('team_members').select('*')
      const mine = (members as TeamMember[] | null)?.find((m) => m.profile_id === auth.user!.id)
      setCanSeeRolodex(Boolean(mine?.sees_all_transactions || mine?.roles.includes('admin')))
    })
  }, [])

  const items: { key: typeof current; label: string; to: string }[] = [
    { key: 'transactions', label: 'Transactions', to: '/admin' },
    { key: 'leads', label: 'Active Buyers', to: '/admin/leads' },
    ...(canSeeRolodex ? [{ key: 'rolodex' as const, label: 'Rolodex', to: '/admin/rolodex' }] : []),
    { key: 'settings', label: 'Settings', to: '/admin/settings' },
  ]

  return (
    <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 0', borderBottom: '1px solid var(--line-soft)', marginBottom: 18 }}>
      {items.map((it) => (
        it.key === current
          ? <span key={it.key} className="btn" style={{ opacity: .5, pointerEvents: 'none' }}>{it.label}</span>
          : <Link key={it.key} className="btn" to={it.to}>{it.label}</Link>
      ))}
    </nav>
  )
}
