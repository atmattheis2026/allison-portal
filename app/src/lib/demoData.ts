import type { SharedPayload, Milestone, DocLine, Contact, TeamMember, SavedContact } from './types'

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
  ['Transaction Coordinator', null, null],
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
    photo_url: null,
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
    photo_url: null,
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
    closed_and_funded: false, closed_and_funded_date: null,
    offer_price: null, contingencies_addendums: null, final_purchase_price: null,
    realtor_member_id: 'tm-allison',
    realtor_title: 'realtor',
    lender_title: 'loan_officer',
    lender_member_id: 'tm-jane',
    listing_url: null,
    hoa_fee: null,
    property_tax: null,
    school_district: null,
    county: null,
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
      // Deliberately a labelled placeholder, not sample legal wording. Real
      // compliance text has to come from her brokerage, and plausible-looking
      // fake disclaimers are the kind of thing that quietly ships.
      disclaimer_text:
        'Your brokerage’s required disclaimer will appear here. Add it in Settings › Branding.',
    },
    lending: {
      name: 'Lending Co.',
      wordmark_text: 'LENDING CO.',
      logo_url: null,
      logo_light_url: null,
      accent_hex: '#7F9CB8',
      needs_light_background: false,
      disclaimer_text:
        'Your lender’s required disclaimer will appear here — NMLS numbers, Equal Housing, and anything else they require.',
    },
  },
  milestones,
  doc_lines,
  contacts,
  notes: [
    {
      id: 'note-1', side: 'real_estate', author_name: 'Allison Mattheis',
      body: 'Appraisal is scheduled — I’ll post the results as soon as they come in.',
      created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    },
    {
      id: 'note-2', side: 'loan', author_name: 'Jane Mitchell',
      body: 'Docs are in underwriting. Should have a decision by end of week.',
      created_at: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    },
  ],
}

/* ------------------------------------------------------- seller sample */

/** Her listing checklist, texted 2026-08-06. No loan side, so this page runs
 *  two columns instead of three. */
const SELLER: [string, boolean, boolean, string | null, string | null][] = [
  ['Listing agreement', true, true, '2026-07-06', 'Listed'],
  ['Photos', true, true, '2026-07-09', null],
  ['MLS go-live', true, true, '2026-07-12', 'Live'],
  ['Open house', true, true, '2026-07-19', null],
  ['Contract agreement', true, true, '2026-07-28', 'Under contract'],
  ['Earnest deposit due', true, true, '2026-07-31', null],
  ['Earnest deposit received', false, true, null, null],
  ['Inspection scheduled', true, false, '2026-08-11', null],
  ['Inspection due', true, false, '2026-08-15', 'Inspection'],
  ['Estoppel ordered and cleared', false, false, null, null],
  ['Appraisal scheduled', true, false, null, null],
  ['Appraisal due', true, false, null, null],
  ['Buyers clear to close', false, false, null, 'Clear to close'],
  ['Provide utilities to buyer', false, false, null, null],
  ['Signing scheduled', true, false, null, null],
  ['Funded!', false, false, null, 'Sold'],
]

export const DEMO_SELLER: SharedPayload = {
  ...DEMO_PAYLOAD,
  transaction: {
    ...DEMO_PAYLOAD.transaction,
    id: 'demo-sell',
    deal_type: 'sell',
    address_line: '412 Windermere Way',
    city_state_zip: 'Windermere, FL 34786',
    photo_url:
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=70',
    closing_date: closingDate(27),
    closed_and_funded: false, closed_and_funded_date: null,
    offer_price: null, contingencies_addendums: null, final_purchase_price: null,
    // A listing she took herself, so there's no outside lender on the page.
    lender: { ...DEMO_PAYLOAD.transaction.lender, name: null, headshot_url: null },
  },
  milestones: SELLER.map(([label, has_date, is_complete, date_value, rail], i) => ({
    id: `sell-${i}`,
    side: 'real_estate' as const,
    label,
    has_date,
    date_value,
    is_complete,
    sort_order: (i + 1) * 10,
    is_rail_step: rail !== null,
    rail_label: rail,
  })),
  doc_lines: [],
  contacts: contacts.filter((c) => c.role_label !== 'Loan Officer'),
  // No loan side on a listing, so no loan-side notes either.
  notes: [{
    id: 'note-sell-1', side: 'real_estate', author_name: 'Allison Mattheis',
    body: 'Open house this Sunday 1–3pm — will report back on turnout.',
    created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  }],
}

/* --------------------------------------------------------- loan-only sample */

const LOAN_ONLY_RAIL: Record<string, string> = {
  'Application complete': 'Application',
  'Submitted to underwriting': 'Underwriting',
  'Clear to close': 'Clear to close',
  'Closing disclosure signed': 'Docs signed',
  'Closing!': 'Funded',
}

/** A refinance, or any loan she's helping with where she isn't the agent —
 *  no real estate side at all. */
export const DEMO_LOAN: SharedPayload = {
  ...DEMO_PAYLOAD,
  transaction: {
    ...DEMO_PAYLOAD.transaction,
    id: 'demo-loan',
    deal_type: 'loan',
    address_line: '18 Driftwood Ln',
    city_state_zip: 'Windermere, FL 34786',
    photo_url: null,
    realtor_member_id: null,
    closing_date: closingDate(18),
    closed_and_funded: false, closed_and_funded_date: null,
    offer_price: null, contingencies_addendums: null, final_purchase_price: null,
  },
  realtor: null,
  milestones: LOAN.map(([label, has_date, is_complete, date_value], i) => ({
    id: `loan-${i}`,
    side: 'loan' as const,
    label,
    has_date,
    date_value,
    is_complete,
    sort_order: (i + 1) * 10,
    is_rail_step: label in LOAN_ONLY_RAIL,
    rail_label: LOAN_ONLY_RAIL[label] ?? null,
  })),
  doc_lines,
  contacts: contacts.filter((c) => !['Realtor', 'Sellers', 'Transaction Coordinator'].includes(c.role_label)),
  notes: [{
    id: 'note-loan-1', side: 'loan', author_name: 'Jane Mitchell',
    body: 'Appraisal ordered — should have it back within the week.',
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
  }],
}

/** All three samples, keyed by the token in the URL. */
export const DEMO_BY_TOKEN: Record<string, SharedPayload> = {
  demo: DEMO_PAYLOAD,
  'demo-sell': DEMO_SELLER,
  'demo-loan': DEMO_LOAN,
}

/* ------------------------------------------------------- team & assignment */

/**
 * Her roster. `sees_all_transactions: true` is the office-manager switch —
 * everyone else only sees deals they're assigned to (see below).
 */
export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'tm-allison', full_name: 'Allison Mattheis', roles: ['admin', 'realtor'],
    license_number: 'SL 3512908',
    headshot_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&q=70',
    phone: '+12536539021', email: null, sees_all_transactions: true, sort_order: 10, profile_id: 'demo-profile',
    realtor_website_1: null, realtor_website_2: null, realtor_website_3: null,
    lender_website_1: null, lender_website_2: null, lender_website_3: null,
    company_name: null, nmls_number: null,
  },
  {
    id: 'tm-marcus', full_name: 'Marcus Webb', roles: ['realtor'],
    license_number: 'SL 3612411', headshot_url: null,
    phone: '+14075550199', email: null, sees_all_transactions: false, sort_order: 20, profile_id: null,
    realtor_website_1: null, realtor_website_2: null, realtor_website_3: null,
    lender_website_1: null, lender_website_2: null, lender_website_3: null,
    company_name: null, nmls_number: null,
  },
  {
    id: 'tm-priya', full_name: 'Priya Nair', roles: ['realtor', 'loan_officer'],
    license_number: 'SL 3688820', headshot_url: null,
    phone: '+14075550233', email: null, sees_all_transactions: false, sort_order: 30, profile_id: null,
    realtor_website_1: null, realtor_website_2: null, realtor_website_3: null,
    lender_website_1: null, lender_website_2: null, lender_website_3: null,
    company_name: null, nmls_number: null,
  },
  {
    id: 'tm-jane', full_name: 'Jane Mitchell', roles: ['loan_officer', 'mortgage_broker'],
    license_number: 'NMLS 1184402',
    headshot_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&q=70',
    phone: '+14075550142', email: null, sees_all_transactions: false, sort_order: 40, profile_id: null,
    realtor_website_1: null, realtor_website_2: null, realtor_website_3: null,
    lender_website_1: null, lender_website_2: null, lender_website_3: null,
    company_name: null, nmls_number: null,
  },
]

/** Which roster people are on each demo transaction. Admin-only — never sent to clients. */
export const TRANSACTION_ASSIGNEES: Record<string, string[]> = {
  'demo-tx': ['tm-allison', 'tm-jane'],
  'demo-sell': ['tm-allison', 'tm-priya'],
}

/** Saved vendors — the premade options for contacts other than team members. */
export const SAVED_CONTACTS: SavedContact[] = [
  { id: 'sc-1', group_key: 'people', role_label: 'Title Company', name: 'Summit Title & Escrow', phone: '+14075550177', email: null, photo_url: null, sort_order: 10 },
  { id: 'sc-2', group_key: 'people', role_label: 'Homeowners Insurance', name: 'Reunion Coastal Insurance', phone: '+14075550188', email: null, photo_url: null, sort_order: 10 },
  { id: 'sc-3', group_key: 'utilities', role_label: 'Power', name: 'Duke Energy', phone: '+18007002443', email: null, photo_url: null, sort_order: 10 },
  { id: 'sc-4', group_key: 'utilities', role_label: 'Water', name: 'Toho Water', phone: '+14079442000', email: null, photo_url: null, sort_order: 10 },
]
