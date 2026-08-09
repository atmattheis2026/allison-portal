import { useEffect, useState } from 'react'
import { DEMO_MODE, supabase } from './supabase'
import type { TeamMember } from './types'

/**
 * Whether the signed-in person is tagged "Database Manager" in Settings >
 * Team — the only role (besides the cross-team platform-admin flag, which
 * this deliberately doesn't check) allowed to delete a transaction or
 * active-buyer file outright. Deleting is enforced server-side by RLS
 * regardless (see migration 052) — this is just for hiding the button from
 * everyone else instead of showing them an action that will fail.
 */
export function useIsDatabaseManager(): boolean {
  const [isManager, setIsManager] = useState(DEMO_MODE)

  useEffect(() => {
    if (DEMO_MODE || !supabase) return
    supabase.auth.getUser().then(async ({ data: auth }) => {
      if (!auth.user) return
      const { data: members } = await supabase!.from('team_members').select('*')
      const mine = (members as TeamMember[] | null)?.find((m) => m.profile_id === auth.user!.id)
      setIsManager(Boolean(mine?.roles.includes('admin')))
    })
  }, [])

  return isManager
}
