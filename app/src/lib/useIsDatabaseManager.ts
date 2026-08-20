import { useEffect, useState } from 'react'
import { DEMO_MODE, supabase } from './supabase'
import type { TeamMember } from './types'

/**
 * Whether the signed-in person is tagged "Database Manager" in Settings >
 * Team, OR carries the cross-team platform-admin flag (migration 023) —
 * RLS already treats platform admin as a full bypass everywhere, so the UI
 * has to recognize it too, or a platform admin sees buttons/pages vanish
 * for actions the database would actually let them do (this exact bug,
 * fixed 2026-08-19 — see AdminNav's Home Page/Rolodex links, which read
 * empty for Allison despite her having full access). Deleting a transaction
 * is enforced server-side by RLS regardless (migration 052) — this is just
 * for hiding buttons from everyone else instead of showing an action that
 * will fail.
 */
export function useIsDatabaseManager(): boolean {
  const [isManager, setIsManager] = useState(DEMO_MODE)

  useEffect(() => {
    if (DEMO_MODE || !supabase) return
    supabase.auth.getUser().then(async ({ data: auth }) => {
      if (!auth.user) return
      const [{ data: members }, { data: me }] = await Promise.all([
        supabase!.from('team_members').select('*'),
        supabase!.from('profiles').select('is_platform_admin').eq('id', auth.user!.id).maybeSingle(),
      ])
      const mine = (members as TeamMember[] | null)?.find((m) => m.profile_id === auth.user!.id)
      setIsManager(Boolean(mine?.roles.includes('admin') || me?.is_platform_admin))
    })
  }, [])

  return isManager
}
