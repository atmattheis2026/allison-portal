import { useEffect, useState } from 'react'
import { DEMO_MODE, supabase } from './supabase'
import { useIsDatabaseManager } from './useIsDatabaseManager'

/**
 * Whether the signed-in person should see a "Home Page" link at all —
 * Database Managers always do; anyone else only if a Database Manager has
 * granted them at least one folder (see migration 066). Works the same way
 * for a staff nav (AdminNav) and a mentor's own page (MentorHome) — the
 * `resource_folder_access` self-read policy scopes the query to the
 * caller's own grants either way, so this hook doesn't need to know which
 * kind of person is asking.
 */
export function useCanSeeHomePage(): boolean {
  const isDatabaseManager = useIsDatabaseManager()
  const [hasGrant, setHasGrant] = useState(DEMO_MODE)

  useEffect(() => {
    if (DEMO_MODE || !supabase) return
    supabase.auth.getUser().then(async ({ data: auth }) => {
      if (!auth.user) return
      const { data } = await supabase!.from('resource_folder_access').select('id').limit(1)
      setHasGrant(Boolean(data && data.length > 0))
    })
  }, [])

  return isDatabaseManager || hasGrant
}
