/**
 * Buyer guide handouts — one screen for every guide, picked by `kind`:
 *   /admin/va-guide, /admin/leads/:id/va-guide           VA Buyer Guide
 *   /admin/fha-conv-guide, /admin/leads/:id/fha-conv-guide  FHA vs Conventional
 * The general route gives a blank handout; the client route pre-fills the
 * greeting and adds "Save PDF to client file". Same printed look and PDF
 * machinery as the Loan Options Worksheet.
 */
import { type ComponentType, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AdminNav from '../components/AdminNav'
import VaGuidePages from '../components/VaGuidePages'
import FhaConvGuidePages from '../components/FhaConvGuidePages'
import { DEMO_MODE, supabase } from '../lib/supabase'
import { buildSheetPdf, downloadBlob } from '../lib/sheetPdf'
import type { Lead } from '../lib/types'
import './Admin.css'
import './LoanWorksheet.css'

export type GuideKind = 'va' | 'fha-conv'

const GUIDES: Record<GuideKind, { title: string; file: string; blurb: string; Pages: ComponentType<{ name?: string }> }> = {
  va: {
    title: 'VA buyer guide',
    file: 'VA Buyer Guide',
    blurb: 'A four-page handout for VA buyers: the benefits, the funding fee, property tax breaks, what closing costs look like, and next steps.',
    Pages: VaGuidePages,
  },
  'fha-conv': {
    title: 'FHA vs conventional guide',
    file: 'FHA vs Conventional',
    blurb: 'A four-page handout comparing FHA and conventional loans: mortgage insurance, down payment, credit, and fees at closing.',
    Pages: FhaConvGuidePages,
  },
}

function safeFileName(s: string) { return s.replace(/[\\/:*?"<>|#%]/g, '').trim() }

export default function AdminGuide({ kind }: { kind: GuideKind }) {
  const guide = GUIDES[kind]
  const { Pages } = guide
  const { id } = useParams<{ id: string }>()
  const [lead, setLead] = useState<Lead | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<'' | 'save' | 'download'>('')
  const [status, setStatus] = useState<ReactNode>('')

  useEffect(() => {
    if (DEMO_MODE || !supabase || !id) return
    supabase.from('leads').select('*').eq('id', id).single().then(({ data }) => {
      const l = data as Lead | null
      if (!l) return
      setLead(l)
      setName([l.full_name, l.full_name_2].filter((x) => x && x.trim()).join(' & '))
    })
  }, [id])

  // Preview is the real 816px pages, scaled down to fit the screen.
  const stageRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    function fit() {
      const stage = stageRef.current, box = scaleRef.current
      if (!stage || !box) return
      const s = Math.min(1, (stage.clientWidth - 24) / 816)
      box.style.transform = `scale(${s})`
      box.style.marginLeft = `${Math.max(0, (stage.clientWidth - 816 * s) / 2)}px`
      stage.style.height = `${box.scrollHeight * s + 36}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  })

  const printRef = useRef<HTMLDivElement>(null)
  const fileName = () => `${guide.file}${name.trim() ? ` - ${safeFileName(name)}` : ''}.pdf`

  async function download() {
    setBusy('download'); setStatus('Building the PDF…')
    try {
      downloadBlob(await buildSheetPdf(printRef.current!), fileName())
      setStatus('Downloaded')
    } catch (e) {
      setStatus(`Couldn't build the PDF: ${(e as Error).message}`)
    } finally { setBusy('') }
  }

  async function saveToClientFile() {
    if (!supabase || !id) return
    setBusy('save'); setStatus('Building the PDF…')
    try {
      const blob = await buildSheetPdf(printRef.current!)
      const file = fileName()
      const path = `lead-docs/${id}-${Date.now()}-${file}`
      setStatus('Saving to their file…')
      const { error: upErr } = await supabase.storage.from('media').upload(path, blob, { contentType: 'application/pdf' })
      if (upErr) throw new Error(upErr.message)
      const { data: pub } = supabase.storage.from('media').getPublicUrl(path)
      const { error: insErr } = await supabase.from('lead_documents')
        .insert({ lead_id: id, file_name: file, file_url: pub.publicUrl, storage_path: path })
      if (insErr) throw new Error(insErr.message)
      setStatus(<>Saved to {lead?.full_name || 'the client'}'s Documents. <a href={pub.publicUrl} target="_blank" rel="noreferrer">Open it</a></>)
    } catch (e) {
      setStatus(`Couldn't save it: ${(e as Error).message}`)
    } finally { setBusy('') }
  }

  return (
    <div className="admin">
      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 17.5 }}>
          <Link to="/admin/leads" className="muted" style={{ textDecoration: 'none' }}>Active Clients</Link>
          {lead && <>{' / '}<Link to={`/admin/leads/${id}`} className="muted" style={{ textDecoration: 'none' }}>{lead.full_name || 'Unnamed buyer'}</Link></>}
          {' / '}{guide.title}
        </span>
        <nav className="adminnav">
          {id && <Link className="btn" to={`/admin/leads/${id}`}>← Back to client</Link>}
        </nav>
      </header>
      <AdminNav current="leads" />

      <div className="lw">
        <div className="card setcard">
          <div className="lw-head">
            <div>
              <h2>{guide.title}</h2>
              <p className="sethelp" style={{ margin: 0 }}>
                {guide.blurb} Add a name to personalize the greeting, or leave it blank for a general handout.
              </p>
            </div>
            <div className="lw-actions">
              {!DEMO_MODE && lead && (
                <button className="btn primary" onClick={saveToClientFile} disabled={!!busy}>
                  {busy === 'save' ? 'Saving…' : 'Save PDF to client file'}
                </button>
              )}
              <button className="btn" onClick={download} disabled={!!busy}>{busy === 'download' ? 'Building…' : 'Download PDF'}</button>
            </div>
          </div>
          <label className="field" style={{ maxWidth: 420, display: 'block', marginBottom: 14 }}>
            <span>Prepared for (optional)</span>
            <input type="text" value={name} placeholder="Client name" style={{ width: '100%' }}
                   onChange={(e) => setName(e.target.value)} />
          </label>
          {status && <p className="lw-status" style={{ margin: '0 0 12px' }}>{status}</p>}
          <div className="lw-stage" ref={stageRef}>
            <div className="lw-scale" ref={scaleRef}>
              <Pages name={name} />
            </div>
          </div>
        </div>
      </div>

      {/* Unscaled copy used only to build the PDF, kept off-screen. */}
      <div ref={printRef} aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, width: 816, pointerEvents: 'none' }}>
        <Pages name={name} />
      </div>
    </div>
  )
}
