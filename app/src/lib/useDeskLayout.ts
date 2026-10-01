import { useSyncExternalStore } from 'react'

/**
 * True on a computer-sized screen (1200px and up), where her editing view
 * switches to the desk layout: checklists side by side, contacts as a table.
 *
 * Subscribed to the browser's own media query, so it can't go stale when the
 * window is resized (the problem with the old read-once hook, see the note at
 * the top of Dashboard.tsx). Only the editing view uses it; the client view's
 * layout is still decided purely in CSS.
 */
const QUERY = '(min-width: 1200px)'

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

export function useDeskLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
