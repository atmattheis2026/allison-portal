/**
 * Loan Options Worksheet — the numbers and the saved rate table.
 *
 * The rate table is one row per team in `loan_rate_sheets` (migration 075).
 * If that migration hasn't been run on the live database yet, the page still
 * works: rates fall back to this browser's own storage, and the page says so.
 * Client details are never stored here — the finished PDF goes into the
 * client's Documents instead, same as any uploaded file.
 */
import { supabase } from './supabase'

export type MiRule = 'none' | 'lt20' | 'always'

export interface LoanProgram {
  id: string
  name: string
  rate: number | null
  apr: number | null
  /** Free text on purpose — "20–30%" for DSCR. The first number is the minimum. */
  minDown: string
  best: string
  term: number
  mi: MiRule
  /** Annual mortgage insurance, % of the loan. */
  miPct: number
  /** Upfront fee rolled into the loan: FHA UFMIP, VA funding fee, USDA guarantee fee. */
  fee: number
}

export interface RateSheet {
  programs: LoanProgram[]
  as_of: string | null
  assumptions: string
  intro_1: string
  intro_2: string
  default_tax_rate: number
  default_insurance: number
  /** True until she saves her own rates the first time. */
  examples: boolean
}

export interface WorksheetClient {
  name: string
  date: string
  agent: string
  price: number | null
  downPct: number | null
  credit: string
  propertyType: string
  occupancy: string
  timeline: string
  taxRate: number | null
  insurance: number | null
  hoa: number | null
  notes: string
}

export const DEFAULT_PROGRAMS: LoanProgram[] = [
  { id: 'conv30', name: 'Conventional 30-year fixed', rate: 6.375, apr: 6.521, minDown: '3%', best: 'Solid credit; no MI once you reach 20% equity', term: 30, mi: 'lt20', miPct: 0.5, fee: 0 },
  { id: 'conv15', name: 'Conventional 15-year fixed', rate: 5.625, apr: 5.842, minDown: '3%', best: 'Building equity fast with less total interest', term: 15, mi: 'lt20', miPct: 0.3, fee: 0 },
  { id: 'fha30', name: 'FHA 30-year fixed', rate: 6.0, apr: 6.894, minDown: '3.5%', best: 'Flexible credit and a lower down payment', term: 30, mi: 'always', miPct: 0.55, fee: 1.75 },
  { id: 'va30', name: 'VA 30-year fixed', rate: 5.875, apr: 6.108, minDown: '0%', best: 'Eligible veterans and service members', term: 30, mi: 'none', miPct: 0, fee: 2.15 },
  { id: 'usda30', name: 'USDA 30-year fixed', rate: 6.0, apr: 6.621, minDown: '0%', best: 'Eligible suburban and rural areas, $0 down', term: 30, mi: 'always', miPct: 0.35, fee: 1.0 },
  { id: 'jumbo30', name: 'Jumbo 30-year fixed', rate: 6.625, apr: 6.744, minDown: '10%', best: 'Loan amounts above the conforming limit', term: 30, mi: 'none', miPct: 0, fee: 0 },
  { id: 'arm76', name: '7/6 ARM', rate: 6.125, apr: 6.712, minDown: '5%', best: 'Plans to sell or refinance within 7 years', term: 30, mi: 'lt20', miPct: 0.5, fee: 0 },
  { id: 'dscr', name: 'Investment / DSCR', rate: 7.25, apr: 7.438, minDown: '20–30%', best: 'Investors qualifying on rental income', term: 30, mi: 'none', miPct: 0, fee: 0 },
]

export const DEFAULT_SHEET: RateSheet = {
  programs: DEFAULT_PROGRAMS,
  as_of: null,
  assumptions: 'Rates as of [DATE] for a single-family primary residence purchase with a 740+ credit score. Rates and APRs could change or not be available at commitment or closing, and vary by borrower.',
  intro_1: "Thank you for the chance to help with your home financing. Every buyer's situation is different, so I put together this snapshot around your goals: the loan programs that fit, what today's rates look like, and a side-by-side look at your estimated monthly payment.",
  intro_2: "Use it as a starting point. Once we review your income, credit and assets together, I'll fine-tune these numbers and get you pre-approved so you and your agent can shop with confidence.",
  default_tax_rate: 1.8,
  default_insurance: 3600,
  examples: true,
}

const LOCAL_KEY = 'loan-rate-sheet'

export type SheetSource = 'database' | 'browser'

/** Loads the team's saved rate table. `source` says where saves will go. */
export async function loadRateSheet(): Promise<{ sheet: RateSheet; source: SheetSource }> {
  if (supabase) {
    const { data, error } = await supabase.from('loan_rate_sheets').select('*').limit(1).maybeSingle()
    if (!error) {
      if (!data) return { sheet: clone(DEFAULT_SHEET), source: 'database' }
      return { sheet: fromRow(data as Record<string, unknown>), source: 'database' }
    }
    // Table missing (migration 075 not run yet) — fall through to this browser.
  }
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (raw) return { sheet: { ...clone(DEFAULT_SHEET), ...JSON.parse(raw) }, source: 'browser' }
  } catch { /* private window etc. */ }
  return { sheet: clone(DEFAULT_SHEET), source: 'browser' }
}

export async function saveRateSheet(sheet: RateSheet, source: SheetSource): Promise<string | null> {
  const toSave = { ...sheet, examples: false }
  if (source === 'database' && supabase) {
    const { data: auth } = await supabase.auth.getUser()
    const { data: me } = await supabase.from('profiles').select('team_id').eq('id', auth.user?.id).single()
    if (!me?.team_id) return "Couldn't find your team to save to."
    const { error } = await supabase.from('loan_rate_sheets').upsert({
      team_id: me.team_id,
      programs: toSave.programs,
      as_of: toSave.as_of || null,
      assumptions: toSave.assumptions,
      intro_1: toSave.intro_1,
      intro_2: toSave.intro_2,
      default_tax_rate: toSave.default_tax_rate,
      default_insurance: toSave.default_insurance,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'team_id' })
    return error ? error.message : null
  }
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(toSave)); return null }
  catch { return "This browser wouldn't save the rates." }
}

function fromRow(r: Record<string, unknown>): RateSheet {
  const d = DEFAULT_SHEET
  return {
    programs: Array.isArray(r.programs) && r.programs.length ? (r.programs as LoanProgram[]) : clone(d.programs),
    as_of: (r.as_of as string) || null,
    assumptions: (r.assumptions as string) ?? d.assumptions,
    intro_1: (r.intro_1 as string) ?? d.intro_1,
    intro_2: (r.intro_2 as string) ?? d.intro_2,
    default_tax_rate: num(r.default_tax_rate) ?? d.default_tax_rate,
    default_insurance: num(r.default_insurance) ?? d.default_insurance,
    examples: false,
  }
}

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) }

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

export function minDownOf(p: LoanProgram): number {
  const m = String(p.minDown || '').match(/[\d.]+/)
  return m ? parseFloat(m[0]) : 0
}

export interface OptionCalc {
  program: LoanProgram
  downPct: number
  minDown: number
  below: boolean
  down: number
  loan: number
  pi: number
  tax: number
  ins: number
  mi: number
  hoa: number
  total: number
}

export function calcOption(p: LoanProgram, c: WorksheetClient, override: number | undefined): OptionCalc {
  const price = c.price ?? 0
  const minDown = minDownOf(p)
  const downPct = override ?? (c.downPct != null ? Math.max(c.downPct, minDown) : minDown)
  const down = price * downPct / 100
  const loan = (price - down) * (1 + (p.fee || 0) / 100)
  const r = (p.rate ?? 0) / 100 / 12
  const n = (p.term || 30) * 12
  const pi = !loan ? 0 : r ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n
  const miOn = p.mi === 'always' || (p.mi === 'lt20' && downPct < 20)
  const mi = miOn ? loan * (p.miPct || 0) / 100 / 12 : 0
  const tax = price * (c.taxRate ?? 0) / 100 / 12
  const ins = (c.insurance ?? 0) / 12
  const hoa = c.hoa ?? 0
  return { program: p, downPct, minDown, below: downPct < minDown, down, loan, pi, tax, ins, mi, hoa, total: pi + mi + tax + ins + hoa }
}

export const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : '$' + Math.round(n).toLocaleString('en-US')
export const pct3 = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(3) + '%')

/** YYYY-MM-DD as local time — never `new Date('2026-07-26')`, which lands a day early in Florida. */
export function fmtLongDate(s: string | null | undefined): string {
  if (!s) return ''
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
