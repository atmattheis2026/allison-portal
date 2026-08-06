import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Demo mode.
 *
 * With no credentials the whole app runs off a local fixture. That is on purpose:
 * it lets the portal be looked at, styled, and handed off before the Supabase
 * project exists, and it means a broken .env never shows a blank page.
 *
 * Once VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.local,
 * this flips to false on its own. Nothing else changes.
 */
export const DEMO_MODE = !url || !key

export const supabase: SupabaseClient | null = DEMO_MODE
  ? null
  : createClient(url!, key!)

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and ' +
        'VITE_SUPABASE_ANON_KEY to app/.env.local, then restart the dev server.',
    )
  }
  return supabase
}
