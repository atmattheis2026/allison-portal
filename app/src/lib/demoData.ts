import type {
  SharedPayload, Milestone, DocLine, Contact, TeamMember, SavedContact,
  Mentor, NetworkAgent, NetworkChecklistItem, NetworkChecklistTemplate,
  Resource,
} from './types'

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

// -------------------------------------------------------------- agent network

export const NETWORK_CHECKLIST_TEMPLATE: NetworkChecklistTemplate[] = [
  { id: 'nct-1', label: 'Signed agreement / paperwork on file', sort_order: 10 },
  { id: 'nct-2', label: 'Onboarded to office systems & tools', sort_order: 20 },
  { id: 'nct-3', label: 'Shadowed a listing or buyer appointment', sort_order: 30 },
  { id: 'nct-4', label: 'Reviewed scripts & lead follow-up process', sort_order: 40 },
  { id: 'nct-5', label: 'Completed first appointment on their own', sort_order: 50 },
  { id: 'nct-6', label: 'First contract written', sort_order: 60 },
  { id: 'nct-7', label: 'First closing', sort_order: 70 },
  { id: 'nct-8', label: '30-day check-in complete', sort_order: 80 },
  { id: 'nct-9', label: '90-day check-in complete', sort_order: 90 },
]

export const MENTORS: Mentor[] = [
  { id: 'mn-derek', full_name: 'Derek Alvarez', email: 'derek@example.com', phone: '+14075550133', sort_order: 10, profile_id: 'demo-mentor-profile' },
  { id: 'mn-priya', full_name: 'Priya Nair', email: 'priya@example.com', phone: '+14075550144', sort_order: 20, profile_id: null },
]

function demoChecklist(agentId: string, doneCount: number): NetworkChecklistItem[] {
  return NETWORK_CHECKLIST_TEMPLATE.map((t, i) => ({
    id: `${agentId}-item-${i}`,
    agent_id: agentId,
    label: t.label,
    is_complete: i < doneCount,
    completed_at: i < doneCount ? '2026-07-01T00:00:00Z' : null,
    sort_order: t.sort_order,
  }))
}

export const NETWORK_AGENTS: NetworkAgent[] = [
  {
    id: 'na-1', team_id: 'demo-team', full_name: 'Jordan Reyes',
    email: 'jordan.reyes@example.com', phone: '+14075550111',
    license_number: null, license_status: 'in_progress',
    source: 'Referred by Marcus Webb', status: 'lead', mentor_id: null,
    strengths_notes: '', growth_notes: '', general_notes: 'Met at the July office open house — very motivated, finishing pre-license course in September.',
    photo_url: null, created_at: '2026-07-28T00:00:00Z', archived_at: null,
  },
  {
    id: 'na-2', team_id: 'demo-team', full_name: 'Casey Nguyen',
    email: 'casey.nguyen@example.com', phone: '+14075550122',
    license_number: 'SL 3901244', license_status: 'licensed',
    source: 'Personal referral', status: 'training', mentor_id: 'mn-derek',
    strengths_notes: 'Great on the phone, very organized with follow-up.',
    growth_notes: 'Still building confidence writing offers — wants to shadow two more before doing one solo.',
    general_notes: '',
    photo_url: null, created_at: '2026-06-10T00:00:00Z', archived_at: null,
  },
  {
    id: 'na-3', team_id: 'demo-team', full_name: 'Morgan Blake',
    email: 'morgan.blake@example.com', phone: '+14075550155',
    license_number: 'SL 3844410', license_status: 'licensed',
    source: 'EPIC provided', status: 'active', mentor_id: 'mn-priya',
    strengths_notes: 'Closed 3 deals in first 4 months — strong negotiator.',
    growth_notes: '',
    general_notes: '',
    photo_url: null, created_at: '2026-03-02T00:00:00Z', archived_at: null,
  },
]

export const NETWORK_CHECKLIST_ITEMS: Record<string, NetworkChecklistItem[]> = {
  'na-1': demoChecklist('na-1', 0),
  'na-2': demoChecklist('na-2', 3),
  'na-3': demoChecklist('na-3', 9),
}

// -------------------------------------------------------------- resources

export const RESOURCES: Resource[] = [
  {
    id: 'res-1', category: 'agents', title: 'New agent onboarding checklist (PDF)',
    description: 'Hand this to anyone starting training.', url: null,
    file_url: null, file_name: 'onboarding-checklist.pdf', sort_order: 10, created_at: '2026-07-01T00:00:00Z',
  },
  {
    id: 'res-2', category: 'agents', title: 'eXp Cap & revenue share explainer',
    description: null, url: 'https://example.com/exp-cap-explainer',
    file_url: null, file_name: null, sort_order: 20, created_at: '2026-07-05T00:00:00Z',
  },
  {
    id: 'res-3', category: 'transactions', title: 'Buyer broker agreement template',
    description: 'Blank template — fill in and have signed before showings.', url: null,
    file_url: null, file_name: 'buyer-broker-template.pdf', sort_order: 10, created_at: '2026-06-15T00:00:00Z',
  },
  {
    id: 'res-4', category: 'transactions', title: 'Title company contact sheet',
    description: null, url: 'https://example.com/title-contacts',
    file_url: null, file_name: null, sort_order: 20, created_at: '2026-06-20T00:00:00Z',
  },
  {
    id: 'res-5', category: 'general', title: 'Office phone / Slack directory',
    description: null, url: 'https://example.com/directory',
    file_url: null, file_name: null, sort_order: 10, created_at: '2026-05-01T00:00:00Z',
  },
]
