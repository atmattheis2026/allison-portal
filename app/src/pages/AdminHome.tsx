// My Home (Allison, 2026-10-01): everyone's own landing page, once per
// session (AdminList.tsx sends them here). Personal on purpose: their
// motivation, to-do list, follow-ups and closings, their own websites,
// quick links, favorite clients and private folders, plus the team's market
// updates board. Migration 086 adds the personal tables; each card that
// needs one says what to run when it's missing, so the page never breaks.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { Lead, MyLink, MyTask, ResourceFolder, TeamMember } from '../lib/types'
import AdminNav from '../components/AdminNav'
import { parseDate } from '../components/ClientCardParts'
import { useIsDatabaseManager } from '../lib/useIsDatabaseManager'
import { TEAM_MEMBERS } from '../lib/demoData'
import './Admin.css'

interface MarketUpdate { id: string; author_profile_id: string; author_name: string | null; body: string; created_at: string }
interface DealRow { id: string; address_line: string; closing_date: string | null; status: string; realtor_member_id: string | null; lender_member_id: string | null }
interface ClosedDeal { id: string; realtor_member_id: string | null; lender_member_id: string | null; final_purchase_price: number | null }
interface OverdueStep { id: string; label: string; date_value: string; transaction_id: string; address: string; mine: boolean }
interface Celebration { leadId: string; name: string; kind: 'birthday' | 'anniversary'; date: Date; years?: number; mine: boolean }
interface ClientActivity { id: string; leadId: string; name: string; text: string; at: string; mine: boolean }

// Cards a person can show or hide with Customize (saved in my_home.hidden_cards).
const CARDS: { key: string; label: string }[] = [
  { key: 'goal', label: 'My year (closings goal)' },
  { key: 'todo', label: 'My to-do list' },
  { key: 'activity', label: 'New from clients' },
  { key: 'followups', label: 'Follow-ups' },
  { key: 'closings', label: 'Closing in the next 30 days' },
  { key: 'steps', label: 'Overdue checklist steps' },
  { key: 'celebrate', label: 'Birthdays & closing anniversaries' },
  { key: 'market', label: 'Market updates' },
  { key: 'websites', label: 'My websites' },
  { key: 'links', label: 'Quick links' },
  { key: 'favorites', label: 'My favorite clients' },
  { key: 'files', label: 'My files' },
]

type FollowLead = Pick<Lead, 'id' | 'full_name' | 'full_name_2' | 'next_followup' | 'followup_note' | 'realtor_member_id' | 'lender_member_id' | 'lead_status'>

const MISSING_086 = 'One database step turns this on: in Supabase\'s SQL Editor, run supabase/migrations/086_my_home_and_personal_folders.sql, then reload.'

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shortDate(d: string) {
  return parseDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function withHttp(url: string) {
  const u = url.trim()
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}
function hostOf(url: string) {
  try { return new URL(withHttp(url)).hostname.replace(/^www\./, '') } catch { return url }
}

export default function AdminHome() {
  const nav = useNavigate()
  const isDatabaseManager = useIsDatabaseManager()
  const [loaded, setLoaded] = useState(false)
  const [me, setMe] = useState<{ id: string; name: string; teamId: string | null }>({ id: 'demo-me', name: 'Allison Mattheis', teamId: null })
  const [myMembers, setMyMembers] = useState<TeamMember[]>([])
  const [has086, setHas086] = useState(true)
  const [motivation, setMotivation] = useState<string | null>(null)
  const [tasks, setTasks] = useState<MyTask[]>([])
  const [links, setLinks] = useState<MyLink[]>([])
  const [updates, setUpdates] = useState<MarketUpdate[]>([])
  const [followLeads, setFollowLeads] = useState<FollowLead[]>([])
  const [starredIds, setStarredIds] = useState<string[]>([])
  const [favorites, setFavorites] = useState<{ id: string; name: string; status: string }[]>([])
  const [deals, setDeals] = useState<DealRow[]>([])
  const [assignedDealIds, setAssignedDealIds] = useState<string[]>([])
  const [myFolders, setMyFolders] = useState<ResourceFolder[]>([])
  const [goal, setGoal] = useState<number | null>(null)
  const [hasGoalCol, setHasGoalCol] = useState(true)
  const [closedThisYear, setClosedThisYear] = useState<ClosedDeal[]>([])
  const [steps, setSteps] = useState<OverdueStep[]>([])
  const [celebrations, setCelebrations] = useState<Celebration[]>([])
  const [activity, setActivity] = useState<ClientActivity[]>([])
  const [hidden, setHidden] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('homeHidden') || '[]') } catch { return [] }
  })
  const [customizing, setCustomizing] = useState(false)
  const [scope, setScope] = useState<'mine' | 'all'>(() => {
    try { return localStorage.getItem('homeScope') === 'all' ? 'all' : 'mine' } catch { return 'mine' }
  })
  const [error, setError] = useState<string | null>(null)

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const todayStr = ymd(today)

  useEffect(() => {
    if (DEMO_MODE || !supabase) {
      // Something to look at without a database.
      setMyMembers(TEAM_MEMBERS.slice(0, 1))
      setMotivation('Every conversation is a chance to change someone\'s life. Make the call.')
      setTasks([
        { id: 't1', profile_id: 'demo-me', body: 'Send BBA to the Parkers', due_date: todayStr, done: false, done_at: null, created_at: '' },
        { id: 't2', profile_id: 'demo-me', body: 'Post the new listing on Instagram', due_date: null, done: false, done_at: null, created_at: '' },
        { id: 't3', profile_id: 'demo-me', body: 'Order sign rider', due_date: null, done: true, done_at: null, created_at: '' },
      ])
      setLinks([{ id: 'l1', profile_id: 'demo-me', title: 'Stellar MLS', url: 'https://www.stellarmls.com', sort_order: 0, created_at: '' }])
      setGoal(24)
      setClosedThisYear(Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, realtor_member_id: null, lender_member_id: null, final_purchase_price: 385000 })))
      setSteps([{ id: 'm1', label: 'Inspection', date_value: ymd(new Date(today.getTime() - 2 * 86400000)), transaction_id: 'demo', address: '2817 Augusta Dr', mine: true }])
      setCelebrations([{ leadId: 'x', name: 'Heather Smith', kind: 'birthday', date: new Date(today.getTime() + 2 * 86400000), mine: true },
                       { leadId: 'y', name: 'Bob & Sue Carter', kind: 'anniversary', years: 3, date: today, mine: true }])
      setActivity([{ id: 'a1', leadId: 'x', name: 'Heather Smith', text: 'Wants a showing: 14 Lake Dr', at: new Date(Date.now() - 5400000).toISOString(), mine: true }])
      setUpdates([{ id: 'u1', author_profile_id: 'x', author_name: 'Rich Surek', body: 'Rates eased a bit this week. 30-year conventional around the mid 6s. Good week to nudge anyone waiting on the sidelines.', created_at: new Date(Date.now() - 3 * 3600000).toISOString() }])
      setLoaded(true)
      return
    }
    ;(async () => {
      const { data: auth } = await supabase!.auth.getUser()
      if (!auth.user) { nav('/login'); return }
      const uid = auth.user.id
      const { data: prof } = await supabase!.from('profiles').select('full_name, team_id, role').eq('id', uid).maybeSingle()
      if ((prof as { role?: string } | null)?.role === 'mentor') { nav('/mentor', { replace: true }); return }
      const teamId = (prof as { team_id?: string } | null)?.team_id ?? null
      const { data: memberRows } = await supabase!.from('team_members').select('*').eq('profile_id', uid)
      const mine = (memberRows as TeamMember[]) ?? []
      setMyMembers(mine)
      setMe({ id: uid, name: (prof as { full_name?: string } | null)?.full_name || mine[0]?.full_name || '', teamId })
      const memberIds = mine.map((m) => m.id)

      const in7 = new Date(today); in7.setDate(in7.getDate() + 7)
      const in30 = new Date(today); in30.setDate(in30.getDate() + 30)

      const [homeRes, taskRes, linkRes, updRes, starRes, folderRes, followRes, dealRes, assignRes] = await Promise.all([
        supabase!.from('my_home').select('*').eq('profile_id', uid).maybeSingle(),
        supabase!.from('my_tasks').select('*').eq('profile_id', uid).order('done').order('due_date', { nullsFirst: false }).order('created_at'),
        supabase!.from('my_links').select('*').eq('profile_id', uid).order('sort_order').order('created_at'),
        teamId
          ? supabase!.from('market_updates').select('*').eq('team_id', teamId).order('created_at', { ascending: false }).limit(30)
          : Promise.resolve({ data: [], error: null }),
        supabase!.from('lead_stars').select('lead_id').eq('profile_id', uid),
        supabase!.from('resource_folders').select('*').eq('owner_profile_id', uid).is('parent_folder_id', null).order('name'),
        supabase!.from('leads').select('id, full_name, full_name_2, next_followup, followup_note, realtor_member_id, lender_member_id, lead_status')
          .is('archived_at', null).not('next_followup', 'is', null).lte('next_followup', ymd(in7)).order('next_followup'),
        supabase!.from('transactions').select('id, address_line, closing_date, status, realtor_member_id, lender_member_id')
          .is('archived_at', null).not('status', 'in', '(closed,fell_through)')
          .gte('closing_date', todayStr).lte('closing_date', ymd(in30)).order('closing_date'),
        memberIds.length
          ? supabase!.from('transaction_assignees').select('transaction_id').in('team_member_id', memberIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      setHas086(!taskRes.error)
      const home = homeRes.data as { motivation?: string | null; closings_goal?: number | null; hidden_cards?: string[] } | null
      setMotivation(home?.motivation ?? null)
      setGoal(home?.closings_goal ?? null)
      if (home?.hidden_cards) setHidden(home.hidden_cards)
      setHasGoalCol(!home || 'closings_goal' in home)
      setTasks((taskRes.data as MyTask[]) ?? [])
      setLinks((linkRes.data as MyLink[]) ?? [])
      setUpdates((updRes.data as MarketUpdate[]) ?? [])
      setMyFolders(folderRes.error ? [] : ((folderRes.data as ResourceFolder[]) ?? []))
      setFollowLeads((followRes.data as FollowLead[]) ?? [])
      setDeals((dealRes.data as DealRow[]) ?? [])
      setAssignedDealIds(((assignRes.data ?? []) as { transaction_id: string }[]).map((a) => a.transaction_id))

      const stars = ((starRes.data ?? []) as { lead_id: string }[]).map((s) => s.lead_id)
      setStarredIds(stars)
      if (stars.length) {
        const { data: favRows } = await supabase!.from('leads').select('id, full_name, full_name_2, lead_status')
          .in('id', stars.slice(0, 100)).is('archived_at', null).order('full_name')
        setFavorites(((favRows ?? []) as { id: string; full_name: string | null; full_name_2: string | null; lead_status: string }[])
          .map((l) => ({ id: l.id, name: (l.full_name || 'Unnamed client') + (l.full_name_2 ? ` & ${l.full_name_2}` : ''), status: l.lead_status })))
      }
      const assigned = ((assignRes.data ?? []) as { transaction_id: string }[]).map((a) => a.transaction_id)
      const mineDeal = (d: { id: string; realtor_member_id: string | null; lender_member_id: string | null }) =>
        memberIds.includes(d.realtor_member_id ?? '') || memberIds.includes(d.lender_member_id ?? '') || assigned.includes(d.id)
      const mineLead = (l: { id: string; realtor_member_id: string | null; lender_member_id: string | null }) =>
        memberIds.includes(l.realtor_member_id ?? '') || memberIds.includes(l.lender_member_id ?? '') || stars.includes(l.id)

      // My year: closed & funded since January 1.
      const { data: closedRows } = await supabase!.from('transactions')
        .select('id, realtor_member_id, lender_member_id, final_purchase_price')
        .eq('closed_and_funded', true).gte('closed_and_funded_date', `${today.getFullYear()}-01-01`)
      setClosedThisYear(((closedRows ?? []) as ClosedDeal[]).filter(mineDeal))

      // Overdue checklist steps on open deals.
      const { data: openRows } = await supabase!.from('transactions').select('id, address_line, realtor_member_id, lender_member_id')
        .is('archived_at', null).not('status', 'in', '(closed,fell_through)')
      const open = (openRows ?? []) as { id: string; address_line: string; realtor_member_id: string | null; lender_member_id: string | null }[]
      const overdue: OverdueStep[] = []
      for (let i = 0; i < open.length; i += 100) {
        const ids = open.slice(i, i + 100).map((d) => d.id)
        const { data: ms } = await supabase!.from('milestones').select('id, label, date_value, transaction_id, internal_only')
          .in('transaction_id', ids).eq('has_date', true).eq('is_complete', false).lt('date_value', todayStr)
        for (const m of (ms ?? []) as { id: string; label: string; date_value: string; transaction_id: string; internal_only?: boolean }[]) {
          if (m.internal_only) continue
          const d = open.find((x) => x.id === m.transaction_id)!
          overdue.push({ id: m.id, label: m.label, date_value: m.date_value, transaction_id: m.transaction_id, address: d.address_line, mine: mineDeal(d) })
        }
      }
      overdue.sort((a, b) => a.date_value.localeCompare(b.date_value))
      setSteps(overdue)

      // Birthdays and closing anniversaries in the next 7 days.
      let people = await supabase!.from('leads')
        .select('id, full_name, full_name_2, birthday, birthday_2, closed_date, lead_status, realtor_member_id, lender_member_id')
        .is('archived_at', null)
      if (people.error) {
        people = await supabase!.from('leads')
          .select('id, full_name, full_name_2, closed_date, lead_status, realtor_member_id, lender_member_id')
          .is('archived_at', null) as typeof people
      }
      const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7)
      const nextOccurrence = (ymdStr: string) => {
        const d = parseDate(ymdStr)
        let next = new Date(today.getFullYear(), d.getMonth(), d.getDate())
        if (next < today) next = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate())
        return { next, year: d.getFullYear() }
      }
      const celebs: Celebration[] = []
      for (const l of (people.data ?? []) as { id: string; full_name: string | null; full_name_2: string | null; birthday?: string | null; birthday_2?: string | null; closed_date: string | null; lead_status: string; realtor_member_id: string | null; lender_member_id: string | null }[]) {
        const mine = mineLead(l)
        const add = (ymdStr: string | null | undefined, kind: Celebration['kind'], name: string) => {
          if (!ymdStr) return
          const { next, year } = nextOccurrence(ymdStr)
          if (next > weekEnd) return
          if (kind === 'anniversary' && next.getFullYear() - year < 1) return
          celebs.push({ leadId: l.id, name, kind, date: next, years: kind === 'anniversary' ? next.getFullYear() - year : undefined, mine })
        }
        add(l.birthday, 'birthday', l.full_name || 'Client')
        add(l.birthday_2, 'birthday', l.full_name_2 || 'Client')
        if (l.lead_status === 'closed') add(l.closed_date, 'anniversary', (l.full_name || 'Client') + (l.full_name_2 ? ` & ${l.full_name_2}` : ''))
      }
      celebs.sort((a, b) => a.date.getTime() - b.date.getTime())
      setCelebrations(celebs)

      // New from clients: referrals, showing requests and offer requests not yet handled.
      const [refs, shows, offers] = await Promise.all([
        supabase!.from('lead_referrals').select('id, lead_id, name, created_at').eq('submitted_by', 'client').eq('resolved', false),
        supabase!.from('lead_maybe_homes').select('id, lead_id, address_line, showing_requested_at').eq('showing_requested', true).eq('showing_request_resolved', false),
        supabase!.from('lead_homes').select('id, lead_id, address_line, offer_requested_at').eq('offer_requested', true).eq('offer_request_resolved', false),
      ])
      const acts: Omit<ClientActivity, 'name' | 'mine'>[] = [
        ...((refs.data ?? []) as { id: string; lead_id: string; name: string; created_at: string }[])
          .map((r) => ({ id: `r${r.id}`, leadId: r.lead_id, text: `Referred a friend: ${r.name}`, at: r.created_at })),
        ...((shows.data ?? []) as { id: string; lead_id: string; address_line: string | null; showing_requested_at: string | null }[])
          .map((r) => ({ id: `s${r.id}`, leadId: r.lead_id, text: `Wants a showing: ${r.address_line || 'a home'}`, at: r.showing_requested_at ?? '' })),
        ...((offers.data ?? []) as { id: string; lead_id: string; address_line: string | null; offer_requested_at: string | null }[])
          .map((r) => ({ id: `o${r.id}`, leadId: r.lead_id, text: `Ready to make an offer: ${r.address_line || 'a home'}`, at: r.offer_requested_at ?? '' })),
      ]
      if (acts.length) {
        const leadIds = [...new Set(acts.map((a) => a.leadId))].slice(0, 100)
        const { data: actLeads } = await supabase!.from('leads').select('id, full_name, full_name_2, realtor_member_id, lender_member_id').in('id', leadIds)
        const byId = new Map(((actLeads ?? []) as { id: string; full_name: string | null; full_name_2: string | null; realtor_member_id: string | null; lender_member_id: string | null }[]).map((l) => [l.id, l]))
        setActivity(acts.filter((a) => byId.has(a.leadId)).map((a) => {
          const l = byId.get(a.leadId)!
          return { ...a, name: (l.full_name || 'Client') + (l.full_name_2 ? ` & ${l.full_name_2}` : ''), mine: mineLead(l) }
        }).sort((a, b) => b.at.localeCompare(a.at)))
      }

      setLoaded(true)
    })()
  }, [nav, today, todayStr])

  function changeScope(next: 'mine' | 'all') {
    setScope(next)
    try { localStorage.setItem('homeScope', next) } catch { /* private window */ }
  }

  if (!loaded) return <div className="centered"><div className="spinner" /></div>

  const memberIds = myMembers.map((m) => m.id)
  const isMineLead = (l: FollowLead) => memberIds.includes(l.realtor_member_id ?? '') || memberIds.includes(l.lender_member_id ?? '') || starredIds.includes(l.id)
  const isMineDeal = (d: DealRow) => memberIds.includes(d.realtor_member_id ?? '') || memberIds.includes(d.lender_member_id ?? '') || assignedDealIds.includes(d.id)
  const shownFollow = followLeads.filter((l) => l.lead_status !== 'inactive' && (scope === 'all' || isMineLead(l)))
  const dueFollow = shownFollow.filter((l) => parseDate(l.next_followup!) <= today)
  const soonFollow = shownFollow.filter((l) => parseDate(l.next_followup!) > today)
  const shownDeals = deals.filter((d) => scope === 'all' || isMineDeal(d))
  const canPostUpdates = isDatabaseManager || myMembers.some((m) => m.roles.includes('loan_officer') || m.roles.includes('mortgage_broker'))
  const websites = [...new Set(myMembers.flatMap((m) => [
    m.realtor_website_1, m.realtor_website_2, m.realtor_website_3, m.lender_website_1, m.lender_website_2, m.lender_website_3,
  ]).filter((u): u is string => !!u && !!u.trim()).map(withHttp))]
  const firstName = (me.name || '').split(/\s+/)[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const show = (key: string) => !hidden.includes(key)
  const shownActivity = activity.filter((a) => scope === 'all' || a.mine)
  const shownSteps = steps.filter((m) => scope === 'all' || m.mine)
  const shownCelebrations = celebrations.filter((c) => scope === 'all' || c.mine)
  async function toggleCard(key: string) {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]
    setHidden(next)
    try { localStorage.setItem('homeHidden', JSON.stringify(next)) } catch { /* private window */ }
    if (DEMO_MODE || !supabase || !has086) return
    // Saved to their account too, so it follows them to another computer.
    await supabase.from('my_home').upsert({ profile_id: me.id, motivation, hidden_cards: next, updated_at: new Date().toISOString() })
  }

  return (
    <div className="admin">
      {DEMO_MODE && <div className="demobar">Demo data — no database connected yet. Nothing you change here is saved.</div>}
      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 17.5 }}>My Home</span>
      </header>
      <AdminNav current="home" />

      <div className="homewrap">
        <div className="homehello">
          <h1>{greeting}{firstName ? `, ${firstName}` : ''}</h1>
          <span className="muted">{today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          <button type="button" className="btn homecustomize" onClick={() => setCustomizing((v) => !v)}>
            {customizing ? 'Done' : '⚙ Customize'}
          </button>
        </div>
        {customizing && (
          <div className="card setcard homecustom">
            <strong>Show on my home page</strong>
            <div className="homecustomgrid">
              {CARDS.map((c) => (
                <label key={c.key} className="clientcheck">
                  <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => toggleCard(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <Motivation text={motivation} disabled={!has086} meId={me.id}
                    onSaved={setMotivation} onError={setError} />
        {error && <p className="sethelp" style={{ color: 'var(--danger)', fontWeight: 600, margin: 0 }}>That didn't save: {error}</p>}

        <div className="homegrid">
          {show('goal') && (
          <section className="card setcard homecard">
            <h2>My year</h2>
            <GoalCard count={closedThisYear.length} volume={closedThisYear.reduce((n, d) => n + (d.final_purchase_price ?? 0), 0)}
                      goal={goal} canSet={has086 && hasGoalCol} meId={me.id} year={today.getFullYear()}
                      onSaved={setGoal} onError={setError} />
          </section>
          )}
          {show('todo') && (
          <section className="card setcard homecard">
            <h2>My to-do list</h2>
            {has086 ? <TaskList tasks={tasks} setTasks={setTasks} todayStr={todayStr} onError={setError} />
              : <p className="sethelp">{MISSING_086}</p>}
          </section>

          )}
          {show('activity') && (
          <section className="card setcard homecard">
            <div className="homecardhead">
              <h2>New from clients</h2>
              <ScopeSwitch scope={scope} onChange={changeScope} />
            </div>
            {shownActivity.length === 0 ? (
              <p className="muted homeempty">No new referrals, showing requests or offer requests.</p>
            ) : (
              <div className="homelist">
                {shownActivity.slice(0, 8).map((a) => (
                  <Link key={a.id} to={`/admin/leads/${a.leadId}`} className="homerow" title={a.text}>
                    <span className="homerowmain"><strong>{a.name}</strong> <span className="homenote">· {a.text}</span></span>
                    {a.at && <span className="muted" style={{ fontSize: 13.5, flex: 'none' }}>{timeAgo(a.at)}</span>}
                  </Link>
                ))}
              </div>
            )}
          </section>
          )}
          {show('followups') && (
          <section className="card setcard homecard">
            <div className="homecardhead">
              <h2>Follow-ups</h2>
              <ScopeSwitch scope={scope} onChange={changeScope} />
            </div>
            {shownFollow.length === 0 ? (
              <p className="muted homeempty">Nothing due this week. 🎉</p>
            ) : (
              <div className="homelist">
                {dueFollow.map((l) => <FollowRow key={l.id} lead={l} due today={today} />)}
                {soonFollow.length > 0 && dueFollow.length > 0 && <div className="homesub">Later this week</div>}
                {soonFollow.map((l) => <FollowRow key={l.id} lead={l} due={false} today={today} />)}
              </div>
            )}
          </section>

          )}
          {show('closings') && (
          <section className="card setcard homecard">
            <div className="homecardhead">
              <h2>Closing in the next 30 days</h2>
              <ScopeSwitch scope={scope} onChange={changeScope} />
            </div>
            {shownDeals.length === 0 ? (
              <p className="muted homeempty">No closings in the next 30 days.</p>
            ) : (
              <div className="homelist">
                {shownDeals.map((d) => {
                  const days = Math.round((parseDate(d.closing_date!).getTime() - today.getTime()) / 86400000)
                  return (
                    <Link key={d.id} to={`/admin/t/${d.id}`} className="homerow">
                      <span className="homerowmain">{d.address_line || 'Untitled property'}</span>
                      <span className={`homechip${days <= 7 ? ' soon' : ''}`}>
                        {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${shortDate(d.closing_date!)} · ${days}d`}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>

          )}
          {show('steps') && (
          <section className="card setcard homecard">
            <div className="homecardhead">
              <h2>Overdue checklist steps</h2>
              <ScopeSwitch scope={scope} onChange={changeScope} />
            </div>
            {shownSteps.length === 0 ? (
              <p className="muted homeempty">Every dated step is on track. ✓</p>
            ) : (
              <div className="homelist">
                {shownSteps.slice(0, 10).map((m) => (
                  <Link key={m.id} to={`/admin/t/${m.transaction_id}`} className="homerow">
                    <span className="homerowmain">{m.label} <span className="homenote">· {m.address || 'Untitled property'}</span></span>
                    <span className="homechip soon">{shortDate(m.date_value)}</span>
                  </Link>
                ))}
                {shownSteps.length > 10 && <span className="muted" style={{ fontSize: 14, padding: '4px 8px' }}>+ {shownSteps.length - 10} more</span>}
              </div>
            )}
          </section>
          )}
          {show('celebrate') && (
          <section className="card setcard homecard">
            <div className="homecardhead">
              <h2>Birthdays &amp; anniversaries this week</h2>
              <ScopeSwitch scope={scope} onChange={changeScope} />
            </div>
            {shownCelebrations.length === 0 ? (
              <p className="muted homeempty">None this week. Add birthdays on a client's file, next to their phone and email.</p>
            ) : (
              <div className="homelist">
                {shownCelebrations.map((c, i) => {
                  const days = Math.round((c.date.getTime() - today.getTime()) / 86400000)
                  return (
                    <Link key={`${c.leadId}-${c.kind}-${i}`} to={`/admin/leads/${c.leadId}`} className="homerow">
                      <span>{c.kind === 'birthday' ? '🎂' : '🏡'}</span>
                      <span className="homerowmain">
                        {c.name} <span className="homenote">· {c.kind === 'birthday' ? 'birthday' : `${c.years} year${c.years === 1 ? '' : 's'} in their home`}</span>
                      </span>
                      <span className={`homechip${days === 0 ? ' soon' : ''}`}>{days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : c.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>
          )}
          {show('market') && (
          <section className="card setcard homecard">
            <h2>Market updates</h2>
            {has086 ? (
              <MarketBoard updates={updates} setUpdates={setUpdates} canPost={canPostUpdates} me={me}
                           canRemoveAny={isDatabaseManager} onError={setError} />
            ) : <p className="sethelp">{MISSING_086}</p>}
          </section>

          )}
          {show('websites') && (
          <section className="card setcard homecard">
            <h2>My websites</h2>
            <MyWebsites sites={websites} />
          </section>

          )}
          {show('links') && (
          <section className="card setcard homecard">
            <h2>Quick links</h2>
            {has086 ? <QuickLinks links={links} setLinks={setLinks} onError={setError} />
              : <p className="sethelp">{MISSING_086}</p>}
          </section>

          )}
          {show('favorites') && (
          <section className="card setcard homecard">
            <h2>My favorite clients</h2>
            {favorites.length === 0 ? (
              <p className="muted homeempty">Star a client on the Clients page (☆ beside their name) and they'll show here.</p>
            ) : (
              <div className="homelist">
                {favorites.map((f) => (
                  <Link key={f.id} to={`/admin/leads/${f.id}`} className="homerow">
                    <span className="homestar">★</span>
                    <span className="homerowmain">{f.name}</span>
                    <span className="muted" style={{ fontSize: 13.5 }}>{f.status === 'under_contract' ? 'Under contract' : f.status === 'closed' ? 'Closed' : f.status === 'nurture' ? 'Nurture' : f.status === 'inactive' ? 'Inactive' : 'Upcoming'}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          )}
          {show('files') && (
          <section className="card setcard homecard">
            <div className="homecardhead">
              <h2>My files</h2>
              <Link to="/admin/resources" className="linkbtn">Open library →</Link>
            </div>
            {myFolders.length === 0 ? (
              <p className="muted homeempty">Your private folders live in the Resource Library under <strong>My files</strong>.</p>
            ) : (
              <div className="foldergrid">
                {myFolders.map((f) => (
                  <Link key={f.id} to={`/admin/resources?folder=${f.id}`} className="foldertile" style={{ textDecoration: 'none' }}>
                    <SmallFolderIcon />
                    <span className="foldertilename">{f.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
          )}
        </div>
      </div>
    </div>
  )
}

function GoalCard({ count, volume, goal, canSet, meId, year, onSaved, onError }: {
  count: number; volume: number; goal: number | null; canSet: boolean; meId: string; year: number
  onSaved: (g: number | null) => void; onError: (e: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(goal ? String(goal) : '')
  async function save(e: React.FormEvent) {
    e.preventDefault()
    const n = draft.trim() ? Math.max(1, Math.round(Number(draft))) : null
    if (draft.trim() && Number.isNaN(n)) return
    onSaved(n); setEditing(false); onError(null)
    if (DEMO_MODE || !supabase) return
    const { error } = await supabase.from('my_home').upsert({ profile_id: meId, closings_goal: n, updated_at: new Date().toISOString() })
    if (error) onError(error.message)
  }
  const pct = goal ? Math.min(100, Math.round((count / goal) * 100)) : 0
  return (
    <div className="goalcard">
      <div className="goalnums">
        <span className="goalbig">{count}</span>
        <span className="muted">{goal ? `of ${goal} closings in ${year}` : `closing${count === 1 ? '' : 's'} in ${year} so far`}</span>
      </div>
      {goal ? <div className="goalbar" aria-label={`${pct}% of goal`}><span style={{ width: `${pct}%` }} /></div> : null}
      {volume > 0 && <span className="muted" style={{ fontSize: 14.5 }}>${Math.round(volume).toLocaleString()} in volume</span>}
      {canSet && (editing ? (
        <form onSubmit={save} className="lookup" style={{ marginTop: 6 }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} inputMode="numeric" placeholder="e.g. 24" aria-label="Closings goal" autoFocus />
          <button type="submit" className="btn primary">Save</button>
          <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      ) : (
        <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => { setDraft(goal ? String(goal) : ''); setEditing(true) }}>
          {goal ? 'Change my goal' : '+ Set a goal for the year'}
        </button>
      ))}
    </div>
  )
}

function ScopeSwitch({ scope, onChange }: { scope: 'mine' | 'all'; onChange: (s: 'mine' | 'all') => void }) {
  return (
    <span className="scopeswitch" role="group" aria-label="Whose">
      <button type="button" className={scope === 'mine' ? 'on' : ''} onClick={() => onChange('mine')}>Mine</button>
      <button type="button" className={scope === 'all' ? 'on' : ''} onClick={() => onChange('all')}>Everyone</button>
    </span>
  )
}

function FollowRow({ lead, due, today }: { lead: FollowLead; due: boolean; today: Date }) {
  const d = parseDate(lead.next_followup!)
  const overdue = d < today
  return (
    <Link to={`/admin/leads/${lead.id}`} className="homerow" title={lead.followup_note ?? undefined}>
      <span className="homerowmain">
        {lead.full_name || 'Unnamed client'}{lead.full_name_2 ? ` & ${lead.full_name_2}` : ''}
        {lead.followup_note && <span className="homenote"> · {lead.followup_note}</span>}
      </span>
      <span className={`homechip${due ? ' soon' : ''}`}>{overdue ? `Overdue · ${shortDate(lead.next_followup!)}` : due ? 'Today' : shortDate(lead.next_followup!)}</span>
    </Link>
  )
}

function SmallFolderIcon() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6.5C3 5.67157 3.67157 5 4.5 5H9.5L11.5 7H19.5C20.3284 7 21 7.67157 21 8.5V17.5C21 18.3284 20.3284 19 19.5 19H4.5C3.67157 19 3 18.3284 3 17.5V6.5Z"
            fill="var(--gold-soft)" fillOpacity="0.35" stroke="var(--gold)" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

/* ------------------------------------------------------------ motivation */

function Motivation({ text, disabled, meId, onSaved, onError }: {
  text: string | null; disabled: boolean; meId: string
  onSaved: (t: string | null) => void; onError: (e: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text ?? '')
  async function save() {
    const value = draft.trim() || null
    onSaved(value); setEditing(false); onError(null)
    if (DEMO_MODE || !supabase) return
    const { error } = await supabase.from('my_home').upsert({ profile_id: meId, motivation: value, updated_at: new Date().toISOString() })
    if (error) onError(error.message)
  }
  if (disabled) return null
  if (editing) {
    return (
      <div className="motivation editing">
        <textarea rows={2} value={draft} autoFocus onChange={(e) => setDraft(e.target.value)}
                  placeholder="A quote, a goal, a reminder of your why. e.g. 24 closings this year. One call at a time." />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn primary" onClick={save}>Save</button>
          <button type="button" className="btn" onClick={() => { setDraft(text ?? ''); setEditing(false) }}>Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <button type="button" className={`motivation${text ? '' : ' empty'}`} onClick={() => { setDraft(text ?? ''); setEditing(true) }}
            title="Click to change">
      {text ? <span className="motivationtext">“{text}”</span> : <span>+ Add something that keeps you going: a quote, a goal, your why</span>}
    </button>
  )
}

/* ------------------------------------------------------------ to-do list */

function TaskList({ tasks, setTasks, todayStr, onError }: {
  tasks: MyTask[]; setTasks: React.Dispatch<React.SetStateAction<MyTask[]>>; todayStr: string
  onError: (e: string | null) => void
}) {
  const [body, setBody] = useState('')
  const [due, setDue] = useState('')
  const open = tasks.filter((t) => !t.done)
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.created_at.localeCompare(b.created_at))
  const done = tasks.filter((t) => t.done)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setBody(''); setDue(''); onError(null)
    if (DEMO_MODE || !supabase) {
      setTasks((cur) => [...cur, { id: `t${Date.now()}`, profile_id: 'demo-me', body: text, due_date: due || null, done: false, done_at: null, created_at: new Date().toISOString() }])
      return
    }
    const { data, error } = await supabase.from('my_tasks').insert({ body: text, due_date: due || null }).select('*').single()
    if (error || !data) { onError(error?.message ?? 'Could not add it.'); return }
    setTasks((cur) => [...cur, data as MyTask])
  }
  async function toggle(t: MyTask) {
    const values = { done: !t.done, done_at: !t.done ? new Date().toISOString() : null }
    setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, ...values } : x)))
    if (DEMO_MODE || !supabase) return
    const { error } = await supabase.from('my_tasks').update(values).eq('id', t.id)
    if (error) onError(error.message)
  }
  async function remove(ids: string[]) {
    setTasks((cur) => cur.filter((x) => !ids.includes(x.id)))
    if (DEMO_MODE || !supabase || !ids.length) return
    const { error } = await supabase.from('my_tasks').delete().in('id', ids)
    if (error) onError(error.message)
  }

  return (
    <>
      <form className="taskadd" onSubmit={add}>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a task…" aria-label="New task" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date (optional)" title="Due date (optional)" />
        <button type="submit" className="btn primary" disabled={!body.trim()}>Add</button>
      </form>
      {open.length === 0 && done.length === 0 && <p className="muted homeempty">Nothing on your list yet.</p>}
      <div className="tasklist">
        {open.map((t) => (
          <label key={t.id} className={`taskrow${t.due_date && t.due_date < todayStr ? ' late' : ''}`}>
            <input type="checkbox" checked={false} onChange={() => toggle(t)} />
            <span className="tasktext">{t.body}</span>
            {t.due_date && <span className={`homechip${t.due_date <= todayStr ? ' soon' : ''}`}>{t.due_date < todayStr ? `Overdue · ${shortDate(t.due_date)}` : t.due_date === todayStr ? 'Today' : shortDate(t.due_date)}</span>}
            <button type="button" className="resdel" onClick={(e) => { e.preventDefault(); remove([t.id]) }} aria-label="Delete task">✕</button>
          </label>
        ))}
        {done.length > 0 && (
          <>
            <div className="homesub" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Done ({done.length})</span>
              <button type="button" className="linkbtn" onClick={() => remove(done.map((t) => t.id))}>Clear done</button>
            </div>
            {done.slice(0, 5).map((t) => (
              <label key={t.id} className="taskrow done">
                <input type="checkbox" checked onChange={() => toggle(t)} />
                <span className="tasktext">{t.body}</span>
              </label>
            ))}
          </>
        )}
      </div>
    </>
  )
}

/* ------------------------------------------------------------ market updates */

function MarketBoard({ updates, setUpdates, canPost, canRemoveAny, me, onError }: {
  updates: MarketUpdate[]; setUpdates: React.Dispatch<React.SetStateAction<MarketUpdate[]>>
  canPost: boolean; canRemoveAny: boolean; me: { id: string; name: string; teamId: string | null }
  onError: (e: string | null) => void
}) {
  const [body, setBody] = useState('')
  const [showAll, setShowAll] = useState(false)
  async function post(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setBody(''); onError(null)
    if (DEMO_MODE || !supabase || !me.teamId) {
      setUpdates((cur) => [{ id: `u${Date.now()}`, author_profile_id: me.id, author_name: me.name, body: text, created_at: new Date().toISOString() }, ...cur])
      return
    }
    const { data, error } = await supabase.from('market_updates')
      .insert({ team_id: me.teamId, author_name: me.name || null, body: text }).select('*').single()
    if (error || !data) { onError(error?.message ?? 'Could not post it.'); return }
    setUpdates((cur) => [data as MarketUpdate, ...cur])
  }
  async function remove(u: MarketUpdate) {
    if (!confirm('Delete this update?')) return
    setUpdates((cur) => cur.filter((x) => x.id !== u.id))
    if (DEMO_MODE || !supabase) return
    const { error } = await supabase.from('market_updates').delete().eq('id', u.id)
    if (error) onError(error.message)
  }
  const shown = showAll ? updates : updates.slice(0, 4)
  return (
    <>
      {canPost && (
        <form className="marketpost" onSubmit={post}>
          <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)}
                    placeholder="Share a market update with the team: rates, programs, what you're seeing…" />
          <button type="submit" className="btn primary" disabled={!body.trim()}>Post</button>
        </form>
      )}
      {updates.length === 0 ? (
        <p className="muted homeempty">{canPost ? 'Nothing posted yet. Be the first.' : 'No updates yet. Your loan officers post rate and market news here.'}</p>
      ) : (
        <div className="marketlist">
          {shown.map((u) => (
            <div key={u.id} className="marketitem">
              <div className="marketmeta">
                <strong>{u.author_name || 'Teammate'}</strong>
                <span className="muted">{timeAgo(u.created_at)}</span>
                {(u.author_profile_id === me.id || canRemoveAny) && (
                  <button type="button" className="resdel" style={{ marginLeft: 'auto' }} onClick={() => remove(u)} aria-label="Delete update">✕</button>
                )}
              </div>
              <p className="marketbody">{u.body}</p>
            </div>
          ))}
          {updates.length > 4 && (
            <button type="button" className="linkbtn" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${updates.length}`}
            </button>
          )}
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------ websites */

function MyWebsites({ sites }: { sites: string[] }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [site, setSite] = useState(sites[0] ?? '')
  if (sites.length === 0) {
    return (
      <p className="muted homeempty">
        Add your websites to your own row in <Link to="/admin/settings?tab=team">Settings › Team</Link> and they'll show here,
        ready to open or share.
      </p>
    )
  }
  async function share(url: string) {
    const nav = navigator as Navigator & { share?: (d: { url: string; title?: string }) => Promise<void> }
    if (nav.share) {
      try { await nav.share({ url, title: hostOf(url) }); return } catch { /* cancelled */ return }
    }
    copy(url)
  }
  function copy(url: string) {
    navigator.clipboard.writeText(url)
    setCopied(url)
    setTimeout(() => setCopied(null), 1600)
  }
  function lookUp(e: React.FormEvent) {
    e.preventDefault()
    if (!address.trim()) return
    // Searches that one site for the address; works for any website
    // without knowing how its own search box is built.
    window.open(`https://www.google.com/search?q=${encodeURIComponent(`site:${hostOf(site)} ${address.trim()}`)}`, '_blank', 'noopener')
  }
  return (
    <>
      <div className="homelist">
        {sites.map((url) => (
          <div key={url} className="siterow">
            <a href={url} target="_blank" rel="noreferrer" className="homerowmain">{hostOf(url)}</a>
            <a className="btn" href={url} target="_blank" rel="noreferrer">Open</a>
            <button type="button" className="btn" onClick={() => copy(url)}>{copied === url ? 'Copied ✓' : 'Copy link'}</button>
            <button type="button" className="btn" onClick={() => share(url)}>Share</button>
          </div>
        ))}
      </div>
      <form className="lookup" onSubmit={lookUp}>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Look up a house: type an address" aria-label="Address to look up" />
        {sites.length > 1 && (
          <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="Which website">
            {sites.map((u) => <option key={u} value={u}>{hostOf(u)}</option>)}
          </select>
        )}
        <button type="submit" className="btn" disabled={!address.trim()}>Look up</button>
      </form>
    </>
  )
}

/* ------------------------------------------------------------ quick links */

function QuickLinks({ links, setLinks, onError }: {
  links: MyLink[]; setLinks: React.Dispatch<React.SetStateAction<MyLink[]>>; onError: (e: string | null) => void
}) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    const row = { title: title.trim() || hostOf(url), url: withHttp(url), sort_order: (links.at(-1)?.sort_order ?? 0) + 1000 }
    setTitle(''); setUrl(''); setAdding(false); onError(null)
    if (DEMO_MODE || !supabase) {
      setLinks((cur) => [...cur, { id: `l${Date.now()}`, profile_id: 'demo-me', created_at: '', ...row }])
      return
    }
    const { data, error } = await supabase.from('my_links').insert(row).select('*').single()
    if (error || !data) { onError(error?.message ?? 'Could not add it.'); return }
    setLinks((cur) => [...cur, data as MyLink])
  }
  async function remove(l: MyLink) {
    setLinks((cur) => cur.filter((x) => x.id !== l.id))
    if (DEMO_MODE || !supabase) return
    const { error } = await supabase.from('my_links').delete().eq('id', l.id)
    if (error) onError(error.message)
  }
  return (
    <>
      {links.length === 0 && !adding && <p className="muted homeempty">The sites you open every day: MLS, showing service, CRM, lender portals.</p>}
      <div className="quicklinks">
        {links.map((l) => (
          <span key={l.id} className="quicklink">
            <a href={l.url} target="_blank" rel="noreferrer" title={l.url}>
              <span className="quickbadge">{(l.title || hostOf(l.url)).slice(0, 1).toUpperCase()}</span>
              {l.title || hostOf(l.url)}
            </a>
            <button type="button" className="resdel" onClick={() => remove(l)} aria-label={`Remove ${l.title}`}>✕</button>
          </span>
        ))}
      </div>
      {adding ? (
        <form className="lookup" onSubmit={add} style={{ marginTop: 8 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name, e.g. Stellar MLS" aria-label="Link name" autoFocus />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Website address" aria-label="Website address" />
          <button type="submit" className="btn primary" disabled={!url.trim()}>Add</button>
          <button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      ) : (
        <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>+ Add a link</button>
      )}
    </>
  )
}
