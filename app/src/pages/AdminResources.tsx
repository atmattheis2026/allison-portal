import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import { RESOURCES } from '../lib/demoData'
import type { Resource, ResourceCategory } from '../lib/types'
import { RESOURCE_CATEGORY_LABEL } from '../lib/types'
import AdminNav from '../components/AdminNav'
import { useIsDatabaseManager } from '../lib/useIsDatabaseManager'
import './Admin.css'

const CATEGORIES: ResourceCategory[] = ['agents', 'transactions', 'general']

/**
 * Database Manager's reference page — docs and links worth keeping handy
 * about agents and transactions, not tied to any one file. Database-Manager
 * only, both to view and to edit (see migration 065). This is also where a
 * Database Manager lands the first time they open the app each browser
 * session — see the redirect in AdminList.tsx.
 */
export default function AdminResources() {
  const [rows, setRows] = useState<Resource[] | null>(null)
  const [addingCategory, setAddingCategory] = useState<ResourceCategory | null>(null)
  const nav = useNavigate()
  const isDatabaseManager = useIsDatabaseManager()

  useEffect(() => {
    if (DEMO_MODE || !supabase) { setRows(RESOURCES); return }

    async function load() {
      const { data: auth } = await supabase!.auth.getUser()
      if (!auth.user) { nav('/login'); return }

      const { data, error } = await supabase!
        .from('resources').select('*').order('category').order('sort_order')
      if (error) console.error(error)
      setRows((data as Resource[]) ?? [])
    }
    load()
  }, [nav])

  // Belt-and-suspenders: RLS already means a non-Database-Manager gets an
  // empty list back, but bounce them to the transactions list rather than
  // showing a confusing empty admin-only page.
  useEffect(() => {
    if (!DEMO_MODE && rows !== null && !isDatabaseManager) nav('/admin', { replace: true })
  }, [rows, isDatabaseManager, nav])

  async function removeResource(id: string) {
    if (!confirm('Remove this from the home page?')) return
    setRows((cur) => cur?.filter((r) => r.id !== id) ?? cur)
    if (DEMO_MODE || !supabase) return
    await supabase.from('resources').delete().eq('id', id)
  }

  function addedResource(r: Resource) {
    setRows((cur) => [...(cur ?? []), r])
    setAddingCategory(null)
  }

  if (!rows) return <div className="centered"><div className="spinner" /></div>

  return (
    <div className="admin">
      {DEMO_MODE && (
        <div className="demobar">
          Demo data — no database connected yet. Nothing you change here is saved.
        </div>
      )}

      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 15 }}>Home Page</span>
      </header>
      <AdminNav current="resources" />

      <div style={{ display: 'grid', gap: 18, maxWidth: 780, margin: '0 auto' }}>
        {CATEGORIES.map((cat) => {
          const items = rows.filter((r) => r.category === cat)
          return (
            <div className="card setcard" key={cat}>
              <h2>{RESOURCE_CATEGORY_LABEL[cat]}</h2>
              {items.length === 0 ? (
                <p className="muted" style={{ fontSize: 12.5 }}>Nothing here yet.</p>
              ) : (
                <div className="notelist">
                  {items.map((r) => (
                    <div className="note" key={r.id}>
                      <p className="notebody" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {r.file_url ? (
                          <a href={r.file_url} target="_blank" rel="noreferrer">{r.title}</a>
                        ) : r.url ? (
                          <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                        ) : (
                          <span>{r.title}</span>
                        )}
                        {r.file_name && <span className="tag" style={{ flex: 'none' }}>{r.file_name}</span>}
                        <button type="button" className="btn" style={{ flex: 'none', marginLeft: 'auto', color: 'var(--danger, #cc3311)' }}
                                onClick={() => removeResource(r.id)}>
                          Delete
                        </button>
                      </p>
                      {r.description && <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>{r.description}</p>}
                    </div>
                  ))}
                </div>
              )}

              {addingCategory === cat ? (
                <AddResource category={cat} onCancel={() => setAddingCategory(null)} onAdded={addedResource} />
              ) : (
                <div className="savebar">
                  <button className="btn" onClick={() => setAddingCategory(cat)}>+ Add a doc or link</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AddResource({ category, onCancel, onAdded }: {
  category: ResourceCategory; onCancel: () => void; onAdded: (r: Resource) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function saveWithFile(file: File | null) {
    if (!title.trim()) { setErr('Give it a title first.'); return }
    if (DEMO_MODE || !supabase) {
      setErr('There’s no database connected yet, so this can’t save for real.')
      return
    }
    setErr(null)
    setUploading(Boolean(file))

    const { data: me } = await supabase.from('profiles')
      .select('team_id').eq('id', (await supabase.auth.getUser()).data.user?.id).single()
    if (!me?.team_id) { setErr('Couldn’t work out which team you’re on.'); setUploading(false); return }

    let file_url: string | null = null
    let file_name: string | null = null
    if (file) {
      const path = `resources/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('media').upload(path, file)
      if (uploadError) { setErr(`Couldn't upload that: ${uploadError.message}`); setUploading(false); return }
      const { data: pub } = supabase.storage.from('media').getPublicUrl(path)
      file_url = pub.publicUrl
      file_name = file.name
    }

    const { data, error } = await supabase.from('resources')
      .insert({
        team_id: me.team_id, category, title,
        description: description || null, url: url || null,
        file_url, file_name,
      })
      .select('*').single()

    setUploading(false)
    if (error || !data) { setErr(error?.message ?? 'Could not save that.'); return }
    onAdded(data as Resource)
  }

  return (
    <div style={{
      background: 'var(--panel-2)', border: '1px solid var(--line)',
      borderRadius: 'var(--r-md)', padding: '12px 14px', marginTop: 10,
    }}>
      <div className="field">
        <label>Title</label>
        <input value={title} autoFocus onChange={(e) => setTitle(e.target.value)}
               placeholder="e.g. Buyer broker agreement template" />
      </div>
      <div className="field">
        <label>Description (optional)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field">
        <label>Link (optional)</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </div>
      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
      <div className="savebar">
        <button type="button" className="btn primary" disabled={uploading}
                onClick={() => saveWithFile(null)}>
          {uploading ? 'Saving…' : 'Save'}
        </button>
        <label className="btn" style={{ cursor: 'pointer' }}>
          <input type="file" style={{ display: 'none' }} disabled={uploading}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) saveWithFile(f) }} />
          {uploading ? 'Uploading…' : 'Save with a file upload instead'}
        </label>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
