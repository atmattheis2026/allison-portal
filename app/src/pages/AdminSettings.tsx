import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { BrandKind, DealType, Side } from '../lib/types'
import './Admin.css'

/**
 * Settings — the two screens Allison can use without anyone's help.
 *
 *  Branding   she uploads both company logos and sets each accent color
 *  Checklists she edits the buyer list and BUILDS the seller list herself
 *
 * These exist so the parts of the build that were blocked on her (logos, brand
 * rules, the seller workflow) became things she can do rather than things she
 * has to send someone.
 */
export default function AdminSettings() {
  const [tab, setTab] = useState<'branding' | 'checklists'>('branding')

  return (
    <div className="admin">
      {DEMO_MODE && (
        <div className="demobar">
          Demo mode — no database connected yet, so nothing here saves.
        </div>
      )}

      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 15 }}>Settings</span>
        <nav className="adminnav">
          <Link className="btn" to="/admin">All transactions</Link>
        </nav>
      </header>

      <div className="tabs">
        <button className={`tab${tab === 'branding' ? ' on' : ''}`} onClick={() => setTab('branding')}>
          Branding
        </button>
        <button className={`tab${tab === 'checklists' ? ' on' : ''}`} onClick={() => setTab('checklists')}>
          Checklists
        </button>
      </div>

      {tab === 'branding' ? <Branding /> : <Checklists />}
    </div>
  )
}

/* ============================================================ branding */

interface BrandForm {
  name: string
  wordmark_text: string
  logo_url: string | null
  logo_light_url: string | null
  accent_hex: string
  needs_light_background: boolean
  disclaimer_text: string
}

const BLANK: BrandForm = {
  name: '', wordmark_text: '', logo_url: null, logo_light_url: null,
  accent_hex: '#C9A44C', needs_light_background: false, disclaimer_text: '',
}

function Branding() {
  const [re, setRe] = useState<BrandForm>({
    ...BLANK, name: 'Mattheis & Co.', wordmark_text: 'MATTHEIS & CO.',
  })
  const [lend, setLend] = useState<BrandForm>({ ...BLANK, accent_hex: '#7F9CB8' })

  return (
    <div className="settings">
      <BrandCard
        kind="real_estate"
        title="Real Estate Company"
        help="This is the logo at the very top of every page, and its color is the
              main accent used across the whole portal."
        value={re} onChange={setRe}
      />
      <BrandCard
        kind="lending"
        title="Lending Company"
        help="This one appears on the Loan section only, with its own color, so the
              page reads as co-branded rather than one company speaking for both."
        value={lend} onChange={setLend}
      />
      <p className="sethelp" style={{ maxWidth: 620 }}>
        Upload a logo made for a <strong>dark background</strong> — usually the white
        or reversed version of your logo file. If your brokerage doesn’t allow its
        logo on dark, tick the box in that section and the top bar becomes a light
        band instead.
      </p>
    </div>
  )
}

function BrandCard({ kind, title, help, value, onChange }: {
  kind: BrandKind; title: string; help: string
  value: BrandForm; onChange: (b: BrandForm) => void
}) {
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<BrandForm>) => onChange({ ...value, ...patch })

  async function upload(file: File, field: 'logo_url' | 'logo_light_url') {
    if (DEMO_MODE || !supabase) {
      // Still show it, so she can see how it looks before the DB exists.
      set({ [field]: URL.createObjectURL(file) } as Partial<BrandForm>)
      return
    }
    setBusy(true)
    const path = `brands/${kind}-${field}-${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true })
    if (error) { console.error(error); setBusy(false); return }
    const { data } = supabase.storage.from('media').getPublicUrl(path)
    set({ [field]: data.publicUrl } as Partial<BrandForm>)
    setBusy(false)
  }

  return (
    <div className="card setcard">
      <h2>{title}</h2>
      <p className="sethelp">{help}</p>

      <div className="field2">
        <div className="field">
          <label>Company name</label>
          <input value={value.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="field">
          <label>Text to show if there’s no logo</label>
          <input value={value.wordmark_text}
                 onChange={(e) => set({ wordmark_text: e.target.value })} />
        </div>
      </div>

      <div className="field2">
        <div className="field">
          <label>Logo for dark backgrounds</label>
          <LogoDrop url={value.logo_url} busy={busy}
                    onFile={(f) => upload(f, 'logo_url')} />
        </div>
        <div className="field">
          <label>Logo for light backgrounds (optional)</label>
          <LogoDrop url={value.logo_light_url} busy={busy} light
                    onFile={(f) => upload(f, 'logo_light_url')} />
        </div>
      </div>

      <div className="field">
        <label>Accent color</label>
        <div className="swatchrow">
          <input type="color" value={value.accent_hex}
                 onChange={(e) => set({ accent_hex: e.target.value })} />
          <input value={value.accent_hex} style={{ maxWidth: 130 }}
                 onChange={(e) => set({ accent_hex: e.target.value })} />
          <span className="muted" style={{ fontSize: 12 }}>
            Use the exact hex from your brand guidelines.
          </span>
        </div>
      </div>

      <label className="checkline">
        <input type="checkbox" checked={value.needs_light_background}
               onChange={(e) => set({ needs_light_background: e.target.checked })} />
        <span className="cl">
          My brand rules don’t allow this logo on a dark background.
          {kind === 'real_estate' && ' (This switches the top bar to a light band.)'}
        </span>
      </label>

      <div className="field" style={{ marginTop: 16 }}>
        <label>Disclaimer for the bottom of the page</label>
        <textarea
          rows={4} value={value.disclaimer_text}
          onChange={(e) => set({ disclaimer_text: e.target.value })}
          placeholder={kind === 'real_estate'
            ? 'Paste your brokerage’s required wording here'
            : 'Paste your lender’s required wording here (NMLS, Equal Housing, etc.)'}
        />
        <p className="sethelp" style={{ margin: '8px 0 0' }}>
          Leave this blank until your {kind === 'real_estate' ? 'brokerage' : 'lender'} has
          approved the exact wording. Nothing shows at the bottom of the page while
          it’s empty, which is better than showing something that hasn’t been checked.
        </p>
      </div>

      <div className="savebar">
        <button className="btn primary" disabled={DEMO_MODE}>Save {title.toLowerCase()}</button>
        {DEMO_MODE && <span className="muted" style={{ fontSize: 12 }}>Saving needs the database connected.</span>}
      </div>
    </div>
  )
}

function LogoDrop({ url, onFile, busy, light }: {
  url: string | null; onFile: (f: File) => void; busy: boolean; light?: boolean
}) {
  return (
    <label className="logodrop" style={light && url ? { background: 'var(--ink)' } : undefined}>
      <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp"
             style={{ display: 'none' }}
             onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      {busy ? <div className="spinner" />
        : url ? <img src={url} alt="logo" />
        : <span>Click to upload<br />PNG or SVG</span>}
      {url && <span style={{ fontSize: 11 }}>Click to replace</span>}
    </label>
  )
}

/* ============================================================ checklists */

interface TemplateRow { id: string; label: string; has_date: boolean; sort_order: number }

let tmpId = 0
const newRow = (order: number): TemplateRow =>
  ({ id: `new-${++tmpId}`, label: '', has_date: false, sort_order: order })

const BUYER_RE = [
  ['Contract day', true], ['Earnest deposit', true], ['Inspection date', true],
  ['Inspection report & negotiations due', true], ['Appraisal date', true],
  ['Appraisal due', true], ['Estoppel complete', false], ['Survey date', true],
  ['Survey complete', false], ['Clear to close', false], ['Signing date', true],
  ['Final wire sent', false], ['Final walk through', false], ['Funded!!', false],
] as const

const BUYER_LOAN = [
  ['Application complete', false], ['Documentation on file', false],
  ['Preapproval complete', false], ['Initial disclosures complete', false],
  ['Lock rate', false], ['Order appraisal', false], ['Order title work', false],
  ['Homeowners insurance set', false], ['Submitted to underwriting', false],
  ['Cleared conditions', false], ['Final underwriting', false],
  ['Clear to close', false], ['Closing disclosure signed', true],
  ['Balance numbers with title & lender', false], ['Closing!', false],
] as const

/** Her listing checklist, texted 2026-08-06. Not a mirror of the buyer list —
 *  it starts before there's a contract and ends at 'Funded!'. */
const SELLER_RE = [
  ['Listing agreement', true], ['Photos', true], ['MLS go-live', true],
  ['Open house', true], ['Contract agreement', true], ['Earnest deposit due', true],
  ['Earnest deposit received', false], ['Inspection scheduled', true],
  ['Inspection due', true], ['Estoppel ordered and cleared', false],
  ['Appraisal scheduled', true], ['Appraisal due', true],
  ['Buyers clear to close', false], ['Provide utilities to buyer', false],
  ['Signing scheduled', true], ['Funded!', false],
] as const

function seedRows(src: readonly (readonly [string, boolean])[]): TemplateRow[] {
  return src.map(([label, has_date], i) => ({
    id: `seed-${i}-${label}`, label, has_date, sort_order: (i + 1) * 10,
  }))
}

function Checklists() {
  const [dealType, setDealType] = useState<DealType>('buy')
  const [side, setSide] = useState<Side>('real_estate')

  // Both lists come from her own texts. The seller loan side stays empty because
  // her listing checklist has no loan steps, which hides the whole Loan section
  // on listings.
  const [lists, setLists] = useState<Record<string, TemplateRow[]>>({
    'buy:real_estate': seedRows(BUYER_RE),
    'buy:loan': seedRows(BUYER_LOAN),
    'sell:real_estate': seedRows(SELLER_RE),
    'sell:loan': [],
  })

  const key = `${dealType}:${side}`
  const rows = lists[key] ?? []
  const setRows = (next: TemplateRow[]) => setLists({ ...lists, [key]: next })

  const update = (id: string, patch: Partial<TemplateRow>) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const remove = (id: string) => setRows(rows.filter((r) => r.id !== id))

  const add = () =>
    setRows([...rows, newRow((rows.at(-1)?.sort_order ?? 0) + 10)])

  const move = (id: string, dir: -1 | 1) => {
    const i = rows.findIndex((r) => r.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    setRows(next.map((r, k) => ({ ...r, sort_order: (k + 1) * 10 })))
  }

  return (
    <div className="settings">
      <div className="card setcard">
        <h2>Checklists</h2>
        <p className="sethelp">
          These are the master lists. Editing here changes what gets copied onto
          <strong> new</strong> transactions — it won’t rewrite deals already in progress,
          so nothing you have going right now will shift under you.
        </p>

        <div className="tabs">
          <button className={`tab${dealType === 'buy' ? ' on' : ''}`} onClick={() => setDealType('buy')}>
            Buyer
          </button>
          <button className={`tab${dealType === 'sell' ? ' on' : ''}`} onClick={() => setDealType('sell')}>
            Listing / Seller
          </button>
        </div>

        <div className="tabs">
          <button className={`tab${side === 'real_estate' ? ' on' : ''}`} onClick={() => setSide('real_estate')}>
            Real Estate side
          </button>
          <button className={`tab${side === 'loan' ? ' on' : ''}`} onClick={() => setSide('loan')}>
            Loan side
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="emptynote" style={{ padding: '28px 8px' }}>
            {dealType === 'sell' && side === 'loan' ? (
              <>
                Nothing here, on purpose.<br /><br />
                <span style={{ color: 'var(--ink-faint)' }}>
                  Your listing checklist doesn’t have any loan steps, so the Loan
                  section is hidden entirely on listings and the page runs two
                  columns instead of three. Add steps here only if you want a loan
                  section on your seller pages.
                </span>
              </>
            ) : 'Nothing here yet.'}
          </div>
        ) : (
          rows.map((r) => (
            <div className="tmplrow" key={r.id}>
              <button className="grip" onClick={() => move(r.id, -1)} title="Move up">↑</button>
              <button className="grip" onClick={() => move(r.id, 1)} title="Move down">↓</button>
              <input type="text" value={r.label} placeholder="Name this step"
                     onChange={(e) => update(r.id, { label: e.target.value })} />
              <button className={`datetoggle${r.has_date ? ' on' : ''}`}
                      title="Does this step have a date?"
                      onClick={() => update(r.id, { has_date: !r.has_date })}>
                {r.has_date ? 'Has date' : 'No date'}
              </button>
              <button className="del" onClick={() => remove(r.id)} title="Delete">×</button>
            </div>
          ))
        )}

        <div className="savebar">
          <button className="btn" onClick={add}>+ Add a step</button>
          <button className="btn primary" disabled={DEMO_MODE}>Save checklist</button>
          {DEMO_MODE && (
            <span className="muted" style={{ fontSize: 12 }}>
              Saving needs the database connected.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
