import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import { RESOURCES, RESOURCE_FOLDERS, RESOURCE_FOLDER_ACCESS, RESOURCE_FOLDER_NOTES, TEAM_MEMBERS, MENTORS } from '../lib/demoData'
import type { Resource, ResourceCategory, ResourceFolder, ResourceFolderAccess, ResourceFolderNote, TeamMember, Mentor } from '../lib/types'
import { RESOURCE_CATEGORY_LABEL } from '../lib/types'
import AdminNav from '../components/AdminNav'
import { useIsDatabaseManager } from '../lib/useIsDatabaseManager'
import './Admin.css'

const CATEGORIES: ResourceCategory[] = ['agents', 'transactions', 'general']

/**
 * The Home Page — Database Managers manage it, and can open individual
 * folders up to specific people (any team member, or a mentor) who can then
 * add and remove files inside that one folder (see migration 066). Unfiled
 * items at the top of each section stay Database-Manager-only, same as
 * before folders existed.
 *
 * There's no role gate at the top of this component on purpose — RLS is
 * what actually decides what comes back for `folders` and `rows`. A regular
 * team member or a granted mentor sees only the folder(s) they're granted;
 * a Database Manager sees everything. See useCanSeeHomePage() for how the
 * nav link itself decides whether to show up for someone.
 */
export default function AdminResources() {
  const [rows, setRows] = useState<Resource[] | null>(null)
  const [folders, setFolders] = useState<ResourceFolder[]>([])
  const [folderNotes, setFolderNotes] = useState<ResourceFolderNote[]>([])
  const [isMentorViewer, setIsMentorViewer] = useState(false)
  const [addingTo, setAddingTo] = useState<{ category: ResourceCategory; folderId: string | null } | null>(null)
  const [creatingFolderIn, setCreatingFolderIn] = useState<ResourceCategory | null>(null)
  const [managingAccessFor, setManagingAccessFor] = useState<string | null>(null)
  const nav = useNavigate()
  const isDatabaseManager = useIsDatabaseManager()

  useEffect(() => {
    if (DEMO_MODE || !supabase) {
      setRows(RESOURCES)
      setFolders(RESOURCE_FOLDERS)
      setFolderNotes(RESOURCE_FOLDER_NOTES)
      return
    }

    async function load() {
      const { data: auth } = await supabase!.auth.getUser()
      if (!auth.user) { nav('/login'); return }

      const { data: me } = await supabase!.from('profiles').select('role').eq('id', auth.user.id).maybeSingle()
      setIsMentorViewer(me?.role === 'mentor')

      const { data: folderData, error: folderError } = await supabase!
        .from('resource_folders').select('*').order('category').order('sort_order')
      if (folderError) console.error(folderError)
      setFolders((folderData as ResourceFolder[]) ?? [])

      const { data, error } = await supabase!
        .from('resources').select('*').order('category').order('sort_order')
      if (error) console.error(error)
      setRows((data as Resource[]) ?? [])

      const { data: noteData, error: noteError } = await supabase!
        .from('resource_folder_notes').select('*').order('created_at', { ascending: false })
      if (noteError) console.error(noteError)
      setFolderNotes((noteData as ResourceFolderNote[]) ?? [])
    }
    load()
  }, [nav])

  function addedResource(r: Resource) {
    setRows((cur) => [...(cur ?? []), r])
    setAddingTo(null)
  }

  async function removeResource(id: string) {
    if (!confirm('Remove this?')) return
    setRows((cur) => cur?.filter((r) => r.id !== id) ?? cur)
    if (DEMO_MODE || !supabase) return
    await supabase.from('resources').delete().eq('id', id)
  }

  function addedFolderNote(n: ResourceFolderNote) {
    setFolderNotes((cur) => [n, ...cur])
  }

  function createdFolder(f: ResourceFolder) {
    setFolders((cur) => [...cur, f])
    setCreatingFolderIn(null)
  }

  async function deleteFolder(folder: ResourceFolder) {
    const count = rows?.filter((r) => r.folder_id === folder.id).length ?? 0
    const warning = count > 0
      ? `Delete "${folder.name}" and everything in it (${count} file${count === 1 ? '' : 's'})? This can't be undone.`
      : `Delete "${folder.name}"? This can't be undone.`
    if (!confirm(warning)) return
    setFolders((cur) => cur.filter((f) => f.id !== folder.id))
    setRows((cur) => cur?.filter((r) => r.folder_id !== folder.id) ?? cur)
    if (DEMO_MODE || !supabase) return
    await supabase.from('resource_folders').delete().eq('id', folder.id)
  }

  if (!rows) return <div className="centered"><div className="spinner" /></div>

  const nothingToSee = !isDatabaseManager && folders.length === 0

  return (
    <div className="admin">
      {DEMO_MODE && (
        <div className="demobar">
          Demo data — no database connected yet. Nothing you change here is saved.
        </div>
      )}

      {isMentorViewer ? (
        <header className="adminbar">
          <span className="wordmark" style={{ fontSize: 15 }}>
            <Link to="/mentor" className="muted" style={{ textDecoration: 'none' }}>My agents</Link>
            {' / '}Home Page
          </span>
          <nav className="adminnav">
            <Link className="btn" to="/mentor">← My agents</Link>
          </nav>
        </header>
      ) : (
        <>
          <header className="adminbar">
            <span className="wordmark" style={{ fontSize: 15 }}>Home Page</span>
          </header>
          <AdminNav current="resources" />
        </>
      )}

      {nothingToSee ? (
        <div className="centered">
          <p className="muted" style={{ maxWidth: 360, lineHeight: 1.7, textAlign: 'center' }}>
            Nothing has been shared with you here yet.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18, maxWidth: 780, margin: '0 auto' }}>
          {CATEGORIES.map((cat) => {
            const unfiled = rows.filter((r) => r.category === cat && !r.folder_id)
            const catFolders = folders.filter((f) => f.category === cat)
            if (!isDatabaseManager && unfiled.length === 0 && catFolders.length === 0) return null

            return (
              <div className="card setcard" key={cat}>
                <h2>{RESOURCE_CATEGORY_LABEL[cat]}</h2>

                {isDatabaseManager && (
                  unfiled.length === 0 ? (
                    <p className="muted" style={{ fontSize: 12.5 }}>Nothing unfiled here.</p>
                  ) : (
                    <ResourceList items={unfiled} onRemove={removeResource} />
                  )
                )}

                {isDatabaseManager && (
                  addingTo?.category === cat && addingTo.folderId === null ? (
                    <AddResource category={cat} folderId={null} onCancel={() => setAddingTo(null)} onAdded={addedResource} />
                  ) : (
                    <div className="savebar">
                      <button className="btn" onClick={() => setAddingTo({ category: cat, folderId: null })}>
                        + Add a doc or link
                      </button>
                    </div>
                  )
                )}

                {catFolders.map((folder) => (
                  <div key={folder.id} style={{
                    marginTop: 16, background: 'var(--panel-2)', border: '1px solid var(--line)',
                    borderRadius: 'var(--r-md)', padding: '12px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <strong style={{ flex: 1 }}>{folder.name}</strong>
                      {isDatabaseManager && (
                        <>
                          <button type="button" className="btn"
                                  onClick={() => setManagingAccessFor(managingAccessFor === folder.id ? null : folder.id)}>
                            {managingAccessFor === folder.id ? 'Done' : 'Manage access'}
                          </button>
                          <button type="button" className="btn" style={{ color: 'var(--danger, #cc3311)' }}
                                  onClick={() => deleteFolder(folder)}>
                            Delete folder
                          </button>
                        </>
                      )}
                    </div>

                    {isDatabaseManager && managingAccessFor === folder.id && (
                      <FolderAccessEditor folder={folder} />
                    )}

                    <ResourceList items={rows.filter((r) => r.folder_id === folder.id)} onRemove={removeResource} />

                    {addingTo?.category === cat && addingTo.folderId === folder.id ? (
                      <AddResource category={cat} folderId={folder.id} onCancel={() => setAddingTo(null)} onAdded={addedResource} />
                    ) : (
                      <div className="savebar">
                        <button className="btn" onClick={() => setAddingTo({ category: cat, folderId: folder.id })}>
                          + Add a doc or link
                        </button>
                      </div>
                    )}

                    <FolderNotesBoard
                      folder={folder}
                      notes={folderNotes.filter((n) => n.folder_id === folder.id)}
                      onAdded={addedFolderNote}
                    />
                  </div>
                ))}

                {isDatabaseManager && (
                  creatingFolderIn === cat ? (
                    <NewFolder category={cat} onCancel={() => setCreatingFolderIn(null)} onCreated={createdFolder} />
                  ) : (
                    <div className="savebar" style={{ marginTop: 10 }}>
                      <button className="btn" onClick={() => setCreatingFolderIn(cat)}>+ New folder</button>
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ResourceList({ items, onRemove }: { items: Resource[]; onRemove: (id: string) => void }) {
  if (items.length === 0) return null
  return (
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
                    onClick={() => onRemove(r.id)}>
              Delete
            </button>
          </p>
          {r.description && <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>{r.description}</p>}
        </div>
      ))}
    </div>
  )
}

/**
 * A folder's own running log — same shape as the Updates board on
 * transactions/leads. Silent by default: notes don't email anyone unless
 * the person posting checks the box, which then notifies everyone
 * currently granted access to this folder (see migration 067 and the
 * notify-resource-folder-note edge function) — not a digest, not a
 * per-person setting, just "whoever posts decides" for that one note.
 */
function FolderNotesBoard({ folder, notes, onAdded }: {
  folder: ResourceFolder; notes: ResourceFolderNote[]; onAdded: (n: ResourceFolderNote) => void
}) {
  const [draft, setDraft] = useState('')
  const [notify, setNotify] = useState(false)
  const [posting, setPosting] = useState(false)

  async function post() {
    const body = draft.trim()
    if (!body) return

    if (DEMO_MODE || !supabase) {
      onAdded({
        id: `demo-note-${Date.now()}`, folder_id: folder.id, author_name: 'You',
        body, notified: notify, created_at: new Date().toISOString(),
      })
      setDraft(''); setNotify(false)
      return
    }

    setPosting(true)
    const { data: auth } = await supabase.auth.getUser()
    const { data: me } = await supabase.from('profiles').select('full_name').eq('id', auth.user?.id).single()
    const authorName = me?.full_name || null

    const { data: row, error } = await supabase.from('resource_folder_notes')
      .insert({ folder_id: folder.id, body, author_name: authorName })
      .select('*').single()

    if (error || !row) { setPosting(false); alert(error?.message ?? 'Could not post that.'); return }

    if (notify) {
      await supabase.functions.invoke('notify-resource-folder-note', { body: { folder_note_id: row.id } })
      row.notified = true
    }

    setPosting(false)
    onAdded(row as ResourceFolderNote)
    setDraft(''); setNotify(false)
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
      <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Notes</label>
      {notes.length === 0 ? (
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>No notes yet.</p>
      ) : (
        <div className="notelist">
          {notes.map((n) => (
            <div className="note" key={n.id}>
              <div className="notemeta">
                {n.author_name && <span className="noteauthor">{n.author_name}</span>}
                <span className="notewhen">{new Date(n.created_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}</span>
                {n.notified && <span className="tag" style={{ fontSize: 10, flex: 'none' }}>Notified</span>}
              </div>
              <p className="notebody">{n.body}</p>
            </div>
          ))}
        </div>
      )}
      <div className="noteadd">
        <textarea rows={2} value={draft} placeholder="Type a note…" onChange={(e) => setDraft(e.target.value)} />
        <label className="cl" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Notify people with access to this folder
        </label>
        <button type="button" className="btn" onClick={post} disabled={!draft.trim() || posting}>
          {posting ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  )
}

function NewFolder({ category, onCancel, onCreated }: {
  category: ResourceCategory; onCancel: () => void; onCreated: (f: ResourceFolder) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Give the folder a name.'); return }
    if (DEMO_MODE || !supabase) { setErr('There’s no database connected yet, so this can’t save for real.'); return }
    setBusy(true); setErr(null)

    const { data: me } = await supabase.from('profiles')
      .select('team_id').eq('id', (await supabase.auth.getUser()).data.user?.id).single()
    if (!me?.team_id) { setErr('Couldn’t work out which team you’re on.'); setBusy(false); return }

    const { data, error } = await supabase.from('resource_folders')
      .insert({ team_id: me.team_id, category, name })
      .select('*').single()

    setBusy(false)
    if (error || !data) { setErr(error?.message ?? 'Could not create it.'); return }
    onCreated(data as ResourceFolder)
  }

  return (
    <form onSubmit={create} style={{
      marginTop: 10, background: 'var(--panel-2)', border: '1px solid var(--line)',
      borderRadius: 'var(--r-md)', padding: '12px 14px',
    }}>
      <div className="field">
        <label>Folder name</label>
        <input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Title company documents" />
      </div>
      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
      <div className="savebar">
        <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create folder'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

/**
 * Who has access to one folder — every team member and every mentor, as
 * checkboxes. Saving diffs against what's already granted rather than
 * wiping and re-inserting, so it doesn't hand out new resource_folder_access
 * ids for grants that didn't change.
 */
function FolderAccessEditor({ folder }: { folder: ResourceFolder }) {
  const [members, setMembers] = useState<TeamMember[]>(DEMO_MODE ? TEAM_MEMBERS : [])
  const [mentors, setMentors] = useState<Mentor[]>(DEMO_MODE ? MENTORS : [])
  const [grants, setGrants] = useState<ResourceFolderAccess[]>(
    DEMO_MODE ? RESOURCE_FOLDER_ACCESS.filter((a) => a.folder_id === folder.id) : [],
  )
  const [checkedMembers, setCheckedMembers] = useState<Set<string>>(new Set())
  const [checkedMentors, setCheckedMentors] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (DEMO_MODE || !supabase) {
      setCheckedMembers(new Set(grants.filter((g) => g.team_member_id).map((g) => g.team_member_id!)))
      setCheckedMentors(new Set(grants.filter((g) => g.mentor_id).map((g) => g.mentor_id!)))
      return
    }
    supabase.from('team_members').select('*').order('sort_order')
      .then(({ data }) => setMembers((data as TeamMember[]) ?? []))
    supabase.from('mentors').select('*').order('sort_order')
      .then(({ data }) => setMentors((data as Mentor[]) ?? []))
    supabase.from('resource_folder_access').select('*').eq('folder_id', folder.id)
      .then(({ data }) => {
        const g = (data as ResourceFolderAccess[]) ?? []
        setGrants(g)
        setCheckedMembers(new Set(g.filter((x) => x.team_member_id).map((x) => x.team_member_id!)))
        setCheckedMentors(new Set(g.filter((x) => x.mentor_id).map((x) => x.mentor_id!)))
      })
  }, [folder.id])

  function toggleMember(id: string) {
    setCheckedMembers((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleMentor(id: string) {
    setCheckedMentors((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function save() {
    if (DEMO_MODE || !supabase) return
    setBusy(true)

    const currentMemberIds = new Set(grants.filter((g) => g.team_member_id).map((g) => g.team_member_id!))
    const currentMentorIds = new Set(grants.filter((g) => g.mentor_id).map((g) => g.mentor_id!))

    const toAddMembers = [...checkedMembers].filter((id) => !currentMemberIds.has(id))
    const toRemoveMembers = grants.filter((g) => g.team_member_id && !checkedMembers.has(g.team_member_id))
    const toAddMentors = [...checkedMentors].filter((id) => !currentMentorIds.has(id))
    const toRemoveMentors = grants.filter((g) => g.mentor_id && !checkedMentors.has(g.mentor_id))

    for (const id of toAddMembers) {
      await supabase.from('resource_folder_access').insert({ folder_id: folder.id, team_member_id: id })
    }
    for (const id of toAddMentors) {
      await supabase.from('resource_folder_access').insert({ folder_id: folder.id, mentor_id: id })
    }
    for (const g of [...toRemoveMembers, ...toRemoveMentors]) {
      await supabase.from('resource_folder_access').delete().eq('id', g.id)
    }

    const { data } = await supabase.from('resource_folder_access').select('*').eq('folder_id', folder.id)
    setGrants((data as ResourceFolderAccess[]) ?? [])
    setBusy(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div style={{
      marginBottom: 12, padding: '10px 12px', background: 'var(--panel)',
      border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)',
    }}>
      <p className="sethelp" style={{ margin: '0 0 8px' }}>
        Anyone checked here can view and add files in this folder — nothing else on the app.
      </p>
      <label className="eyebrow" style={{ display: 'block', marginBottom: 4 }}>Team</label>
      <div style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
        {members.map((m) => (
          <label key={m.id} className="cl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={checkedMembers.has(m.id)} onChange={() => toggleMember(m.id)} />
            {m.full_name}
          </label>
        ))}
      </div>
      <label className="eyebrow" style={{ display: 'block', marginBottom: 4 }}>Mentors</label>
      <div style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
        {mentors.length === 0 ? (
          <p className="muted" style={{ fontSize: 12.5 }}>No mentors added yet.</p>
        ) : mentors.map((m) => (
          <label key={m.id} className="cl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={checkedMentors.has(m.id)} onChange={() => toggleMentor(m.id)} />
            {m.full_name}
          </label>
        ))}
      </div>
      <div className="savebar">
        <button type="button" className="btn primary" disabled={DEMO_MODE || busy} onClick={save}>
          {busy ? 'Saving…' : saved ? 'Saved' : 'Save access'}
        </button>
        {DEMO_MODE && <span className="muted" style={{ fontSize: 12 }}>Saving needs the database connected.</span>}
      </div>
    </div>
  )
}

function AddResource({ category, folderId, onCancel, onAdded }: {
  category: ResourceCategory; folderId: string | null; onCancel: () => void; onAdded: (r: Resource) => void
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
        team_id: me.team_id, category, folder_id: folderId, title,
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
