import type { SharedPayload, Milestone, DocLine, Contact } from './types'

/**
 * Sample transaction used when no Supabase credentials are present.
 * Address is real (Allison's Aug 4 text) so the page looks like her actual work.
 * Everything else is invented.
 */

let n = 0
const id = () => `demo-${++n}`

const RE: [string, boolean, boolean, string | null, string | null][] = [
  // label, hasDate, complete, dateValue, railLabel
  ['Contract day', true, true, '2026-06-02', 'Contract'],
  ['Earnest deposit', true, true, '2026-06-05', null],
  ['Inspection date', true, true, '2026-06-12', 'Inspection'],
  ['Inspection report & negotiations due', true, true, '2026-06-17', null],
  ['Appraisal date', true, true, '2026-06-30', 'Appraisal'],
  ['Appraisal due', true, true, '2026-07-07', null],
  ['Estoppel complete', false, true, null, null],
  ['Survey date', true, false, null, null],
  ['Survey complete', false, false, null, null],
  ['Clear to close', false, false, null, 'Clear to close'],
  ['Signing date', true, false, '2026-07-26', 'Signing'],
  ['Final wire sent', false, false, null, null],
  ['Final walk through', false, false, null, null],
  ['Funded!!', false, false, null, 'Funded'],
]

const LOAN: [string, boolean, boolean, string | null][] = [
  ['Application complete', false, true, null],
  ['Documentation on file', false, true, null],
  ['Preapproval complete', false, true, null],
  ['Initial disclosures complete', false, true, null],
  ['Lock rate', false, true, '2026-06-20'],
  ['Order appraisal', false, true, null],
  ['Order title work', false, false, null],
  ['Homeowners insurance set', false, false, null],
  ['Submitted to underwriting', false, false, null],
  ['Cleared conditions', false, false, null],
  ['Final underwriting', false, false, null],
  ['Clear to close', false, false, null],
  ['Closing disclosure signed', true, false, null],
  ['Balance numbers with title & lender', false, false, null],
  ['Closing!', false, false, null],
]

const milestones: Milestone[] = [
  ...RE.map(([label, has_date, is_complete, date_value, rail], i) => ({
    id: id(),
    side: 'real_estate' as const,
    label,
    has_date,
    date_value,
    is_complete,
    sort_order: (i + 1) * 10,
    is_rail_step: rail !== null,
    rail_label: rail,
  })),
  ...LOAN.map(([label, has_date, is_complete, date_value], i) => ({
    id: id(),
    side: 'loan' as const,
    label,
    has_date,
    date_value,
    is_complete,
    sort_order: (i + 1) * 10,
    is_rail_step: false,
    rail_label: null,
  })),
]

const docText: Record<string, string[]> = {
  documentation: ['2024 & 2025 W-2s', 'Last 2 pay stubs', 'Bank statements — 60 days', '', '', ''],
  conditions: ['Letter of explanation — deposit', '', '', '', '', ''],
}

const doc_lines: DocLine[] = (['documentation', 'conditions'] as const).flatMap((g) =>
  docText[g].map((text, i) => ({
    id: id(),
    group_key: g,
    text,
    is_checked: text !== '',
    sort_order: i + 1,
  })),
)

const people: [string, string | null, string | null][] = [
  ['Buyers', 'M. & C. Ellison', '+14075550118'],
  ['Sellers', 'R. Delgado', null],
  ['Realtor', 'Allison Mattheis', '+12536539021'],
  ['Loan Officer', 'Jane Mitchell', '+14075550142'],
  ['Lender', 'Alpine Bank', null],
  ['Title Company', 'Summit Title & Escrow', '+14075550177'],
  ['Inspector', null, null],
  ['Homeowners Insurance', null, null],
]

const utils: [string, string | null, string | null][] = [
  ['Power', 'Duke Energy', '+18007002443'],
  ['Water', 'Toho Water', '+14079442000'],
  ['Gas', null, null],
  ['Cable', 'Spectrum', null],
  ['Internet', 'Spectrum', null],
  ['HOA', 'Reunion East CDD', null],
]

const contacts: Contact[] = [
  ...people.map(([role_label, name, phone], i) => ({
    id: id(),
    group_key: 'people' as const,
    role_label,
    name,
    phone,
    email: null,
    note: null,
    sort_order: (i + 1) * 10,
  })),
  ...utils.map(([role_label, name, phone], i) => ({
    id: id(),
    group_key: 'utilities' as const,
    role_label,
    name,
    phone,
    email: null,
    note: null,
    sort_order: (i + 1) * 10,
  })),
]

/** Closing date is kept a fixed number of days out so the countdown always reads well. */
function closingDate(daysOut: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysOut)
  return d.toISOString().slice(0, 10)
}

export const DEMO_PAYLOAD: SharedPayload = {
  transaction: {
    id: 'demo-tx',
    deal_type: 'buy',
    address_line: '7859 Palmilla Ct',
    city_state_zip: 'Reunion, FL 34747',
    photo_url:
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=70',
    status: 'on_track',
    status_note: null,
    closing_date: closingDate(9),
    lender: {
      name: 'Jane Mitchell',
      company: 'Alpine Bank',
      license: 'NMLS 1184402',
      headshot_url:
        'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&q=70',
      phone: '+14075550142',
      email: null,
      is_in_house: false,
    },
  },
  realtor: {
    full_name: 'Allison Mattheis',
    license_number: 'SL 3512908',
    headshot_url:
      'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&q=70',
    phone: '+12536539021',
    email: null,
  },
  brands: {
    real_estate: {
      name: 'Mattheis & Co.',
      wordmark_text: 'MATTHEIS & CO.',
      logo_url: null,
      logo_light_url: null,
      accent_hex: '#C9A44C',
      needs_light_background: false,
    },
    lending: {
      name: 'Lending Co.',
      wordmark_text: 'LENDING CO.',
      logo_url: null,
      logo_light_url: null,
      accent_hex: '#7F9CB8',
      needs_light_background: false,
    },
  },
  milestones,
  doc_lines,
  contacts,
}
