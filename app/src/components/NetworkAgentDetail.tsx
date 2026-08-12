import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import { MENTORS, NETWORK_AGENTS, NETWORK_CHECKLIST_ITEMS } from '../lib/demoData'
import type { Mentor, NetworkAgent, NetworkAgentStatus, NetworkChecklistItem } from '../lib/types'
import { LICENSE_STATUS_LABEL, NETWORK_AGENT_STATUS_LABEL } from '../lib/types'
import AdminNav from './AdminNav'
import '../pages/Admin.css'

const STATUSES: NetworkAgentStatus[] = ['lead', 'training', 'active', 'inactive']

/**
 * The "agent page" — shared by staff (/admin/network/:id) and a mentor
 * viewing their own mentee (/mentor/:id). Same shape as AdminLead.tsx:
 * everything saves on change, no Save button. `viewer` hides the things
 * that are staff-only (contact info editing, mentor assignment, delete) —
 * RLS backs this up server-side either way, this is just so a mentor never
 * sees a control that would fail.
 */
export default function NetworkAgentDetail({ viewer }: { viewer: 'staff' | 'mentor' }) {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()

  const [agent, setAgent] = useState<NetworkAgent | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mentors, setMentors] = useState<Mentor[]>([])
  const [items, setItems] = useState<NetworkChecklistItem[]>([])
  const [saveFlash, setSaveFlash] = useState(false)

  function flashSaved() {
    setSaveFlash(true)
    setTimeout(() => setSaveFlash(false), 1200)
  }

  useEffect(() => {
    if (DEMO_MODE || !supabase || !id) {
      setAgent(NETWORK_AGENTS.find((a) => a.id === id) ?? NETWORK_AGENTS[0])
      setMentors(MENTORS)
      setItems(NETWORK_CHECKLIST_ITEMS[id ?? ''] ?? NETWORK_CHECKLIST_ITEMS['na-1'])
      return
    }

    supabase.from('network_agents').select('*').eq('id', id).single()
      .then(({ data, error }) => {
        if (error) { setLoadError(error.message); return }
        setAgent(data as NetworkAgent)
      })
    if (viewer === 'staff') {
      supabase.from('mentors').select('*').order('sort_order')
        .then(({ data }) => setMentors((data as Mentor[]) ?? []))
    }
    supabase.from('network_checklist_items').select('*').eq('agent_id', id).order('sort_order')
      .then(({ data }) => setItems((data as NetworkChecklistItem[]) ?? []))
  }, [id, viewer])

  async function patchAgent(values: Partial<NetworkAgent>) {
    setAgent((cur) => (cur ? { ...cur, ...values } : cur))
    if (DEMO_MODE || !supabase || !id) return
    const { error } = await supabase.from('network_agents').update(values).eq('id', id)
    if (error) { alert(error.message); return }
    flashSaved()
  }

  async function toggleItem(item: NetworkChecklistItem) {
    const is_complete = !item.is_complete
    const completed_at = is_complete ? new Date().toISOString() : null
    setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, is_complete, completed_at } : i)))
    if (DEMO_MODE || !supabase) return
    await supabase.from('network_checklist_items').update({ is_complete, completed_at }).eq('id', item.id)
    flashSaved()
  }

  async function deleteAgent() {
    if (!agent || !confirm(`Permanently delete "${agent.full_name || 'this lead'}"? This can't be undone.`)) return
    if (DEMO_MODE || !supabase || !id) { nav('/admin/network'); return }
    const { error } = await supabase.from('network_agents').delete().eq('id', id)
    if (error) { alert(`Couldn't delete it: ${error.message}`); return }
    nav('/admin/network')
  }

  const backTo = viewer === 'staff' ? '/admin/network' : '/mentor'
  const backLabel = viewer === 'staff' ? 'Agent Network' : 'My agents'

  if (loadError) {
    return (
      <div className="centered">
        <p className="muted" style={{ maxWidth: 360, textAlign: 'center' }}>
          Couldn't load this page: {loadError}
        </p>
      </div>
    )
  }
  if (!agent) return <div className="centered"><div className="spinner" /></div>

  return (
    <div className="admin">
      {DEMO_MODE && (
        <div className="demobar">
          Demo data — no database connected yet. Nothing you change here is saved.
        </div>
      )}

      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 15 }}>
          <Link to={backTo} className="muted" style={{ textDecoration: 'none' }}>{backLabel}</Link>
          {' / '}{agent.full_name || 'Unnamed'}
        </span>
        <nav className="adminnav">
          {saveFlash && <span className="muted" style={{ fontSize: 12.5 }}>Saved</span>}
          <Link className="btn" to={backTo}>← {backLabel}</Link>
          {viewer === 'staff' && (
            <button className="btn" style={{ color: 'var(--danger, #cc3311)' }} onClick={deleteAgent}>
              Delete
            </button>
          )}
        </nav>
      </header>
      {viewer === 'staff' && <AdminNav current="network" />}

      <div style={{ display: 'grid', gap: 18, maxWidth: 780, margin: '0 auto' }}>
        <div className="card setcard">
          <div className="field">
            <label>Status</label>
            <div className="tabs">
              {STATUSES.map((s) => (
                <button key={s} type="button" className={`tab${agent.status === s ? ' on' : ''}`}
                        onClick={() => patchAgent({ status: s })}>
                  {NETWORK_AGENT_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {viewer === 'staff' && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>Assigned mentor</label>
              <select value={agent.mentor_id ?? ''}
                      onChange={(e) => patchAgent({ mentor_id: e.target.value || null })}>
                <option value="">Not assigned yet</option>
                {mentors.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="card setcard">
          <h2>Contact info</h2>
          {viewer === 'staff' ? (
            <>
              <div className="field2">
                <div className="field">
                  <label>Name</label>
                  <input value={agent.full_name} onChange={(e) => patchAgent({ full_name: e.target.value })} />
                </div>
                <div className="field">
                  <label>How they came to you</label>
                  <input value={agent.source ?? ''} onChange={(e) => patchAgent({ source: e.target.value || null })} />
                </div>
              </div>
              <div className="field2">
                <div className="field">
                  <label>Phone</label>
                  <input value={agent.phone ?? ''} onChange={(e) => patchAgent({ phone: e.target.value || null })} />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input type="email" value={agent.email ?? ''} onChange={(e) => patchAgent({ email: e.target.value || null })} />
                </div>
              </div>
              <div className="field2">
                <div className="field">
                  <label>License number</label>
                  <input value={agent.license_number ?? ''} onChange={(e) => patchAgent({ license_number: e.target.value || null })} />
                </div>
                <div className="field">
                  <label>License status</label>
                  <select value={agent.license_status}
                          onChange={(e) => patchAgent({ license_status: e.target.value as NetworkAgent['license_status'] })}>
                    {(['unlicensed', 'in_progress', 'licensed'] as const).map((s) => (
                      <option key={s} value={s}>{LICENSE_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
              <div>{agent.phone || 'No phone on file'}</div>
              <div>{agent.email || 'No email on file'}</div>
              <div className="muted">{LICENSE_STATUS_LABEL[agent.license_status]}</div>
            </div>
          )}
        </div>

        <div className="card setcard">
          <h2>Training checklist</h2>
          <p className="sethelp">
            {viewer === 'staff'
              ? 'Steps come from your master list in Settings > Agent Network.'
              : 'Check off steps as they’re completed.'}
          </p>
          {items.length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5 }}>No checklist steps yet.</p>
          ) : (
            items.map((item) => (
              <div className="checkline" key={item.id}>
                <input type="checkbox" checked={item.is_complete} onChange={() => toggleItem(item)} />
                <span className="cl" style={item.is_complete ? { opacity: 0.6, textDecoration: 'line-through' } : undefined}>
                  {item.label}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="card setcard">
          <h2>Strengths</h2>
          <textarea rows={3} style={{ width: '100%' }} value={agent.strengths_notes}
                    onChange={(e) => patchAgent({ strengths_notes: e.target.value })}
                    placeholder="What they're doing well…" />
        </div>

        <div className="card setcard">
          <h2>Areas to grow</h2>
          <textarea rows={3} style={{ width: '100%' }} value={agent.growth_notes}
                    onChange={(e) => patchAgent({ growth_notes: e.target.value })}
                    placeholder="What to focus on next…" />
        </div>

        <div className="card setcard">
          <h2>General notes</h2>
          <textarea rows={4} style={{ width: '100%' }} value={agent.general_notes}
                    onChange={(e) => patchAgent({ general_notes: e.target.value })}
                    placeholder="Anything else worth remembering…" />
        </div>
      </div>
    </div>
  )
}
