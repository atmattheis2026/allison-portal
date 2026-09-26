/**
 * Loan Options Worksheet for one client — /admin/leads/:id/loan-worksheet
 *
 * 1. Rate table: saved team-wide (migration 075), updated when rates move.
 * 2. Client details: pre-filled from the client's file, adjusted here.
 * 3. Pick up to three loans → side-by-side payment comparison.
 * 4. The three-page client sheet, saved as a PDF into the client's
 *    Documents and/or downloaded.
 *
 * Client details typed here are not stored anywhere except inside the PDF
 * that gets saved to the client's own file.
 */
import { type InputHTMLAttributes, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AdminNav from '../components/AdminNav'
import LoanSheetPages from '../components/LoanSheetPages'
import { DEMO_MODE, supabase } from '../lib/supabase'
import type { Lead, TeamMember } from '../lib/types'
import {
  type LoanProgram, type MiRule, type RateSheet, type SheetSource, type WorksheetClient,
  DEFAULT_SHEET, calcOption, loadRateSheet, money, num, pct3, saveRateSheet, todayLocal,
} from '../lib/loanWorksheet'
import './Admin.css'
import './LoanWorksheet.css'

const PROPERTY_TYPES = ['Single-family', 'Townhome', 'Condo', '2–4 unit', 'Manufactured', 'Vacation / short-term rental']
const OCCUPANCIES = ['Primary residence', 'Second home', 'Investment property']
const MAX_PICKS = 3

function blankClient(sheet: RateSheet): WorksheetClient {
  return {
    name: '', date: todayLocal(), agent: '', price: null, downPct: null, credit: '',
    propertyType: 'Single-family', occupancy: 'Primary residence', timeline: '',
    taxRate: sheet.default_tax_rate, insurance: sheet.default_insurance, hoa: null, notes: '',
  }
}

/** Which programs to tick first, from what's already on the client's file. */
function initialPicks(lead: Lead | null, programs: LoanProgram[]): string[] {
  const has = (id: string) => programs.some((p) => p.id === id)
  const want: string[] = []
  if (lead?.purchase_type === 'investment') want.push('dscr')
  const byType: Record<string, string> = { Conventional: 'conv30', FHA: 'fha30', VA: 'va30', USDA: 'usda30', Jumbo: 'jumbo30' }
  if (lead?.loan_type && byType[lead.loan_type]) want.push(byType[lead.loan_type])
  want.push('conv30', 'fha30', 'conv15')
  return [...new Set(want)].filter(has).slice(0, MAX_PICKS)
}

function safeFileName(s: string) { return s.replace(/[\\/:*?"<>|#%]/g, '').trim() }

export default function AdminLoanWorksheet() {
  const { id } = useParams<{ id: string }>()
  const [lead, setLead] = useState<Lead | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const [sheet, setSheet] = useState<RateSheet>(DEFAULT_SHEET)
  const [source, setSource] = useState<SheetSource>('browser')
  const [ratesDirty, setRatesDirty] = useState(false)
  const [rateStatus, setRateStatus] = useState('')

  const [client, setClient] = useState<WorksheetClient>(blankClient(DEFAULT_SHEET))
  const [picks, setPicks] = useState<string[]>([])
  const [overrides, setOverrides] = useState<Record<string, number>>({})
  const [budgetHint, setBudgetHint] = useState('')

  const [busy, setBusy] = useState<'' | 'save' | 'download'>('')
  const [pdfStatus, setPdfStatus] = useState<ReactNode>('')

  // ---------- load ----------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { sheet: s, source: src } = await loadRateSheet()
      let l: Lead | null = null
      let roster: TeamMember[] = []
      if (!DEMO_MODE && supabase && id) {
        const { data, error } = await supabase.from('leads').select('*').eq('id', id).single()
        if (error) { if (!cancelled) setLoadError(error.message); return }
        l = data as Lead
        const { data: r } = await supabase.from('team_members').select('*').order('sort_order')
        roster = (r as TeamMember[]) ?? []
      }
      if (cancelled) return
      const c = blankClient(s)
      if (l) {
        c.name = [l.full_name, l.full_name_2].filter((x) => x && x.trim()).join(' & ')
        const agent = roster.find((m) => m.id === l!.realtor_member_id)
        c.agent = agent?.full_name ?? ''
        if (l.purchase_type === 'investment') c.occupancy = 'Investment property'
        if (l.budget) setBudgetHint(`Budget on their file: ${l.budget}`)
      }
      setSheet(s); setSource(src); setLead(l); setClient(c)
      setPicks(initialPicks(l, s.programs)); setReady(true)
    })()
    return () => { cancelled = true }
  }, [id])

  // ---------- rate table ----------
  function patchProgram(pid: string, values: Partial<LoanProgram>) {
    setSheet((s) => ({ ...s, programs: s.programs.map((p) => (p.id === pid ? { ...p, ...values } : p)) }))
    setRatesDirty(true); setRateStatus('')
  }
  function patchSheet(values: Partial<RateSheet>) { setSheet((s) => ({ ...s, ...values })); setRatesDirty(true); setRateStatus('') }
  function addProgram() {
    const pid = 'p' + Date.now().toString(36)
    patchSheet({ programs: [...sheet.programs, { id: pid, name: 'New loan program', rate: null, apr: null, minDown: '', best: '', term: 30, mi: 'none', miPct: 0, fee: 0 }] })
  }
  function removeProgram(p: LoanProgram) {
    if (!confirm(`Remove "${p.name}" from your rate table?`)) return
    patchSheet({ programs: sheet.programs.filter((x) => x.id !== p.id) })
    setPicks((cur) => cur.filter((x) => x !== p.id))
  }
  function togglePick(pid: string, on: boolean) {
    setPicks((cur) => (on ? (cur.length < MAX_PICKS && !cur.includes(pid) ? [...cur, pid] : cur) : cur.filter((x) => x !== pid)))
  }
  async function saveRates() {
    setRateStatus('Saving…')
    const err = await saveRateSheet(sheet, source)
    if (err) { setRateStatus(`Couldn't save: ${err}`); return }
    setSheet((s) => ({ ...s, examples: false })); setRatesDirty(false)
    setRateStatus(source === 'database' ? 'Rates saved for your whole team' : 'Rates saved on this computer')
  }

  // ---------- client ----------
  function patchClient(values: Partial<WorksheetClient>) {
    setClient((c) => ({ ...c, ...values }))
    if ('downPct' in values || 'price' in values) setOverrides({})
  }

  const chosen = useMemo(
    () => picks.map((pid) => sheet.programs.find((p) => p.id === pid)).filter((p): p is LoanProgram => !!p),
    [picks, sheet.programs],
  )
  const options = useMemo(() => chosen.map((p) => calcOption(p, client, overrides[p.id])), [chosen, client, overrides])

  // ---------- preview scaling ----------
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

  // ---------- PDF ----------
  const printRef = useRef<HTMLDivElement>(null)
  async function buildPdf(): Promise<Blob> {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
    await Promise.all(['300 12px LwRoboto', '400 12px LwRoboto', '500 12px LwRoboto', 'italic 500 12px LwCorm']
      .map((f) => document.fonts.load(f).catch(() => null)))
    await document.fonts.ready
    const pages = Array.from(printRef.current!.querySelectorAll<HTMLElement>('.sp'))
    const pdf = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true })
      if (i) pdf.addPage('letter')
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 612, 792)
    }
    return pdf.output('blob')
  }
  const fileName = () => `Loan Options - ${safeFileName(client.name) || 'Client'} - ${client.date || todayLocal()}.pdf`

  async function downloadPdf() {
    setBusy('download'); setPdfStatus('Building the PDF…')
    try {
      const blob = await buildPdf()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = fileName(); document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      setPdfStatus('Downloaded')
    } catch (e) {
      setPdfStatus(`Couldn't build the PDF: ${(e as Error).message}`)
    } finally { setBusy('') }
  }

  async function saveToClientFile() {
    if (!supabase || !id) return
    setBusy('save'); setPdfStatus('Building the PDF…')
    try {
      const blob = await buildPdf()
      const name = fileName()
      const path = `lead-docs/${id}-${Date.now()}-${name}`
      setPdfStatus('Saving to their file…')
      const { error: upErr } = await supabase.storage.from('media').upload(path, blob, { contentType: 'application/pdf' })
      if (upErr) throw new Error(upErr.message)
      const { data: pub } = supabase.storage.from('media').getPublicUrl(path)
      const { error: insErr } = await supabase.from('lead_documents')
        .insert({ lead_id: id, file_name: name, file_url: pub.publicUrl, storage_path: path })
      if (insErr) throw new Error(insErr.message)
      setPdfStatus(<>Saved to {lead?.full_name || 'the client'}'s Documents. <a href={pub.publicUrl} target="_blank" rel="noreferrer">Open it</a></>)
    } catch (e) {
      setPdfStatus(`Couldn't save it: ${(e as Error).message}`)
    } finally { setBusy('') }
  }

  // ---------- render ----------
  if (loadError) {
    return <div className="centered"><p className="muted" style={{ maxWidth: 360, textAlign: 'center' }}>Couldn't load this client: {loadError}</p></div>
  }
  if (!ready) return <div className="centered"><div className="spinner" /></div>

  const numInput = (value: number | null, onChange: (v: number | null) => void, step = '0.01', extra: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className="n" type="number" inputMode="decimal" step={step} value={value ?? ''}
           onChange={(e) => onChange(num(e.target.value))} {...extra} />
  )

  return (
    <div className="admin">
      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 17.5 }}>
          <Link to="/admin/leads" className="muted" style={{ textDecoration: 'none' }}>Active Clients</Link>
          {lead && <>{' / '}<Link to={`/admin/leads/${id}`} className="muted" style={{ textDecoration: 'none' }}>{lead.full_name || 'Unnamed buyer'}</Link></>}
          {' / '}Loan options worksheet
        </span>
        <nav className="adminnav">
          {lead && <Link className="btn" to={`/admin/leads/${id}`}>← Back to client</Link>}
        </nav>
      </header>
      <AdminNav current="leads" />

      <div className="lw">
        {/* ---------- 1. rates ---------- */}
        <div className="card setcard">
          <div className="lw-head">
            <div>
              <h2>1. Your rate table</h2>
              <p className="sethelp" style={{ margin: 0 }}>
                Update rates when they move and press Save rates. Tick <b>Use</b> on up to three loans for this client.
              </p>
            </div>
            <div className="lw-actions">
              <span className="lw-status">{rateStatus || (ratesDirty ? 'Unsaved rate changes' : '')}</span>
              <button className="btn primary" onClick={saveRates} disabled={!ratesDirty && !sheet.examples}>Save rates</button>
            </div>
          </div>
          {sheet.examples && (
            <div className="lw-banner">These are example rates. Replace them with today's rates and press <b>Save rates</b>; after that, every worksheet starts from your saved rates.</div>
          )}
          {source === 'browser' && !DEMO_MODE && (
            <div className="lw-banner">
              Rates are saving on this computer only for now. To share one rate table with your whole team, run
              {' '}<code>supabase/migrations/075_loan_rate_sheets.sql</code> once in Supabase (ask Claude to walk you through it).
            </div>
          )}
          <div className="lw-scroll">
            <table className="lw-rates">
              <thead>
                <tr>
                  <th>Use</th><th>Loan program</th><th>Rate</th><th>APR</th><th>Min. down</th><th>Best for</th>
                  <th title="Loan term in years">Term (yrs)</th><th>Mortgage insurance</th><th>MI per year</th>
                  <th title="FHA upfront MIP, VA funding fee, USDA guarantee fee">Financed fee</th><th />
                </tr>
              </thead>
              <tbody>
                {sheet.programs.map((p) => {
                  const on = picks.includes(p.id)
                  return (
                    <tr key={p.id} className={on ? 'on' : ''}>
                      <td><input type="checkbox" checked={on} disabled={!on && picks.length >= MAX_PICKS}
                                 title={!on && picks.length >= MAX_PICKS ? 'Up to three loans' : ''}
                                 aria-label={`Use ${p.name}`} onChange={(e) => togglePick(p.id, e.target.checked)} /></td>
                      <td style={{ minWidth: 200 }}><input value={p.name} onChange={(e) => patchProgram(p.id, { name: e.target.value })} /></td>
                      <td style={{ minWidth: 112 }}><div className="lw-pct">{numInput(p.rate, (v) => patchProgram(p.id, { rate: v }), '0.125')}<span>%</span></div></td>
                      <td style={{ minWidth: 112 }}><div className="lw-pct">{numInput(p.apr, (v) => patchProgram(p.id, { apr: v }), '0.001')}<span>%</span></div></td>
                      <td style={{ minWidth: 86 }}><input value={p.minDown} onChange={(e) => patchProgram(p.id, { minDown: e.target.value })} /></td>
                      <td style={{ minWidth: 240 }}><input value={p.best} onChange={(e) => patchProgram(p.id, { best: e.target.value })} /></td>
                      <td style={{ minWidth: 74 }}>{numInput(p.term, (v) => patchProgram(p.id, { term: v ?? 30 }), '1', { min: 1 })}</td>
                      <td style={{ minWidth: 160 }}>
                        <select value={p.mi} onChange={(e) => patchProgram(p.id, { mi: e.target.value as MiRule })}>
                          <option value="none">None</option>
                          <option value="lt20">Under 20% down</option>
                          <option value="always">Always</option>
                        </select>
                      </td>
                      <td style={{ minWidth: 96 }}><div className="lw-pct">{numInput(p.miPct, (v) => patchProgram(p.id, { miPct: v ?? 0 }), '0.01', { min: 0 })}<span>%</span></div></td>
                      <td style={{ minWidth: 96 }}><div className="lw-pct">{numInput(p.fee, (v) => patchProgram(p.id, { fee: v ?? 0 }), '0.05', { min: 0 })}<span>%</span></div></td>
                      <td><button type="button" className="lw-x" title="Remove" aria-label={`Remove ${p.name}`} onClick={() => removeProgram(p)}>×</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="savebar" style={{ justifyContent: 'flex-start' }}><button className="btn" onClick={addProgram}>+ Add a loan program</button></div>
          <div className="lw-grid" style={{ marginTop: 10 }}>
            <div className="field"><label>Rates as of</label>
              <input type="date" value={sheet.as_of ?? ''} onChange={(e) => patchSheet({ as_of: e.target.value || null })} /></div>
            <div className="field wide"><label>Rate assumptions (prints under the rate table)</label>
              <textarea rows={2} value={sheet.assumptions} onChange={(e) => patchSheet({ assumptions: e.target.value })} /></div>
          </div>
          <details>
            <summary>Defaults and intro letter</summary>
            <div className="lw-grid">
              <div className="field"><label>Default property tax rate (% per year)</label>
                {numInput(sheet.default_tax_rate, (v) => patchSheet({ default_tax_rate: v ?? 0 }))}</div>
              <div className="field"><label>Default homeowners insurance ($ per year)</label>
                {numInput(sheet.default_insurance, (v) => patchSheet({ default_insurance: v ?? 0 }), '50')}</div>
              <div className="field wide"><label>Intro letter, first paragraph</label>
                <textarea rows={3} value={sheet.intro_1} onChange={(e) => patchSheet({ intro_1: e.target.value })} /></div>
              <div className="field wide"><label>Intro letter, second paragraph</label>
                <textarea rows={3} value={sheet.intro_2} onChange={(e) => patchSheet({ intro_2: e.target.value })} /></div>
            </div>
            <p className="sethelp" style={{ margin: 0 }}>Saved along with your rates.</p>
          </details>
        </div>

        {/* ---------- 2. client ---------- */}
        <div className="card setcard">
          <h2>2. Client details</h2>
          <p className="sethelp">Filled in from their file where possible. Change anything here; it only goes into this worksheet.</p>
          <div className="lw-grid">
            <div className="field"><label>Client name</label><input value={client.name} onChange={(e) => patchClient({ name: e.target.value })} /></div>
            <div className="field"><label>Date</label><input type="date" value={client.date} onChange={(e) => patchClient({ date: e.target.value })} /></div>
            <div className="field"><label>Referred by</label><input value={client.agent} placeholder="Agent name" onChange={(e) => patchClient({ agent: e.target.value })} /></div>
            <div className="field"><label>Target price ($)</label>
              {numInput(client.price, (v) => patchClient({ price: v }), '1000', { min: 0, placeholder: budgetHint ? budgetHint.replace('Budget on their file: ', '') : '' })}
              {budgetHint && <span className="lw-sub">{budgetHint}</span>}</div>
            <div className="field"><label>Down payment (%)</label>
              {numInput(client.downPct, (v) => patchClient({ downPct: v }), '0.5', { min: 0, max: 100, placeholder: 'Program minimum' })}</div>
            <div className="field"><label>Credit range</label><input value={client.credit} placeholder="e.g. 720–739" onChange={(e) => patchClient({ credit: e.target.value })} /></div>
            <div className="field"><label>Property type</label>
              <select value={client.propertyType} onChange={(e) => patchClient({ propertyType: e.target.value })}>
                {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select></div>
            <div className="field"><label>Occupancy</label>
              <select value={client.occupancy} onChange={(e) => patchClient({ occupancy: e.target.value })}>
                {OCCUPANCIES.map((t) => <option key={t}>{t}</option>)}
              </select></div>
            <div className="field"><label>Timeline</label><input value={client.timeline} placeholder="e.g. Spring 2027" onChange={(e) => patchClient({ timeline: e.target.value })} /></div>
            <div className="field"><label>Property tax rate (% per year)</label>{numInput(client.taxRate, (v) => patchClient({ taxRate: v }), '0.01', { min: 0 })}</div>
            <div className="field"><label>Homeowners insurance ($ per year)</label>{numInput(client.insurance, (v) => patchClient({ insurance: v }), '50', { min: 0 })}</div>
            <div className="field"><label>HOA / CDD ($ per month)</label>{numInput(client.hoa, (v) => patchClient({ hoa: v }), '5', { min: 0 })}</div>
            <div className="field wide"><label>Notes for the client</label>
              <textarea rows={3} value={client.notes} placeholder="Programs to watch, down payment assistance, credit tips, seller credit strategy, timing…"
                        onChange={(e) => patchClient({ notes: e.target.value })} /></div>
          </div>
        </div>

        {/* ---------- 3. side-by-side ---------- */}
        <div className="card setcard">
          <h2>3. Side-by-side</h2>
          <p className="sethelp">Built from the loans ticked in step 1. You can change the down payment for any option right here.</p>
          {options.length === 0 ? (
            <div className="lw-empty">Tick <b>Use</b> next to up to three loans in step 1 and they'll line up here.</div>
          ) : (
            <div className="lw-scroll">
              <table className="lw-cmp">
                <thead><tr><th style={{ width: '26%' }} />{options.map((o, i) => <th key={o.program.id}>Option {i + 1}</th>)}</tr></thead>
                <tbody>
                  <tr><td>Loan program</td>{options.map((o) => <td key={o.program.id}><b>{o.program.name}</b></td>)}</tr>
                  <tr><td>Purchase price</td>{options.map((o) => <td key={o.program.id}>{money(client.price)}</td>)}</tr>
                  <tr><td>Down payment</td>{options.map((o) => (
                    <td key={o.program.id}>
                      <div className="lw-pct">
                        <input className="n" type="number" inputMode="decimal" step="0.5" min={0} max={100}
                               value={+o.downPct.toFixed(2)} aria-label={`Down payment percent for ${o.program.name}`}
                               onChange={(e) => {
                                 const v = num(e.target.value)
                                 setOverrides((cur) => { const n = { ...cur }; if (v == null) delete n[o.program.id]; else n[o.program.id] = v; return n })
                               }} />
                        <span>%</span>
                      </div>
                      <span className="lw-sub">{money(o.down)}</span>
                      {o.below && <span className="lw-warn">Below the {o.program.minDown} minimum</span>}
                    </td>
                  ))}</tr>
                  <tr><td>Loan amount</td>{options.map((o) => (
                    <td key={o.program.id}>{money(o.loan)}{o.program.fee ? <span className="lw-sub">includes {o.program.fee}% financed fee</span> : null}</td>
                  ))}</tr>
                  <tr><td>Rate / APR</td>{options.map((o) => <td key={o.program.id}>{pct3(o.program.rate)} / {pct3(o.program.apr)}</td>)}</tr>
                  <tr className="sub"><td colSpan={options.length + 1}>Estimated monthly payment</td></tr>
                  <tr><td>Principal &amp; interest</td>{options.map((o) => <td key={o.program.id}>{money(o.pi)}</td>)}</tr>
                  <tr><td>Property taxes</td>{options.map((o) => <td key={o.program.id}>{money(o.tax)}</td>)}</tr>
                  <tr><td>Homeowners insurance</td>{options.map((o) => <td key={o.program.id}>{money(o.ins)}</td>)}</tr>
                  <tr><td>Mortgage insurance</td>{options.map((o) => <td key={o.program.id}>{money(o.mi)}</td>)}</tr>
                  <tr><td>HOA / CDD</td>{options.map((o) => <td key={o.program.id}>{money(o.hoa)}</td>)}</tr>
                  <tr className="tot"><td>Total monthly</td>{options.map((o) => <td key={o.program.id}>{money(o.total)}</td>)}</tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="sethelp" style={{ margin: '10px 0 0', fontSize: 14.5 }}>
            Estimates only. Principal and interest use the rate and term from your table; ARMs are shown at the starting rate. Financed fees are added to the loan amount.
          </p>
        </div>

        {/* ---------- 4. client sheet ---------- */}
        <div className="card setcard">
          <div className="lw-head">
            <div>
              <h2>4. Client sheet</h2>
              <p className="sethelp" style={{ margin: 0 }}>This is exactly what your client and their agent receive. It updates as you type.</p>
            </div>
            <div className="lw-actions">
              {!DEMO_MODE && lead && (
                <button className="btn primary" onClick={saveToClientFile} disabled={!!busy}>
                  {busy === 'save' ? 'Saving…' : 'Save PDF to client file'}
                </button>
              )}
              <button className="btn" onClick={downloadPdf} disabled={!!busy}>{busy === 'download' ? 'Building…' : 'Download PDF'}</button>
            </div>
          </div>
          {pdfStatus && <p className="lw-status" style={{ margin: '0 0 12px' }}>{pdfStatus}</p>}
          <div className="lw-stage" ref={stageRef}>
            <div className="lw-scale" ref={scaleRef}>
              <LoanSheetPages sheet={sheet} client={client} options={options} selected={picks} />
            </div>
          </div>
        </div>
      </div>

      {/* Unscaled copy used only to build the PDF, kept off-screen. */}
      <div ref={printRef} aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, width: 816, pointerEvents: 'none' }}>
        <LoanSheetPages sheet={sheet} client={client} options={options} selected={picks} />
      </div>
    </div>
  )
}
