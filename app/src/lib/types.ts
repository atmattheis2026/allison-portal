export type DealType = 'buy' | 'sell' | 'loan'
export type Side = 'real_estate' | 'loan'
export type TeamRole =
  | 'realtor' | 'loan_officer' | 'admin' | 'transaction_coordinator' | 'mortgage_broker'
  | 'broker_associate'
export type BrandKind = 'real_estate' | 'lending'
export type DocGroup = 'documentation' | 'conditions'
export type ContactGroup = 'people' | 'utilities'

export type TxStatus =
  | 'under_contract' | 'on_track' | 'attention' | 'closed' | 'fell_through'

export const STATUS_LABEL: Record<TxStatus, string> = {
  under_contract: 'Under contract',
  on_track: 'Under contract — on track',
  attention: 'Needs attention',
  closed: 'Closed',
  fell_through: 'Fell through',
}

export interface Brand {
  name: string
  wordmark_text: string
  logo_url: string | null
  logo_light_url: string | null
  accent_hex: string
  needs_light_background: boolean
  /** Required compliance language for this company, shown in the page footer.
   *  Ships empty — her brokerage and lender have to approve the wording. */
  disclaimer_text: string | null
}

export interface Person {
  full_name: string
  license_number: string | null
  headshot_url: string | null
  phone: string | null
  email: string | null
  /** Personal/business links — eXp site, social, etc. Set once on the team
   *  member and shown automatically on every client page they appear on. */
  website_1?: string | null
  website_2?: string | null
  website_3?: string | null
}

/**
 * Someone on Allison's team.
 *
 * `roles` is a list, not one pick — her team has people who are both an agent
 * and a loan officer. `sees_all_transactions` is the per-person access switch:
 * an office manager gets true and sees the whole book, an agent gets false and
 * sees only the deals they're assigned to. Both are set in Settings › Team.
 */
export interface TeamMember {
  id: string
  full_name: string
  roles: TeamRole[]
  license_number: string | null
  headshot_url: string | null
  phone: string | null
  email: string | null
  sees_all_transactions: boolean
  sort_order: number
  /** Set once this person actually signs in — before that, they're just a
   *  roster entry with no login of their own. */
  profile_id: string | null
  /** Shown automatically under their card when they're cast as the agent on
   *  a deal — never when they're shown as the lender, even for someone who
   *  holds both roles. */
  realtor_website_1: string | null
  realtor_website_2: string | null
  realtor_website_3: string | null
  /** Same idea, for whenever this person is shown as the lender instead. */
  lender_website_1: string | null
  lender_website_2: string | null
  lender_website_3: string | null
  /** Only meaningful for loan officers/mortgage brokers — shown wherever
   *  this person is cast as the lender, same story as the lender websites. */
  company_name: string | null
  nmls_number: string | null
}

// Order here is the display order everywhere these are listed as a set (e.g.
// the role pills in Settings > Team) — grouped so the two agent-side titles
// sit together, then the two loan-side titles, then the rest.
export const ROLE_LABEL: Record<TeamRole, string> = {
  realtor: 'Agent',
  broker_associate: 'Broker associate',
  loan_officer: 'Loan officer',
  mortgage_broker: 'Mortgage broker',
  admin: 'Database manager',
  transaction_coordinator: 'Transaction coordinator',
}

/**
 * A vendor she's saved for reuse — title companies, inspectors, insurance,
 * utility providers. Keyed by role_label so each contact slot has its own
 * list (saved Title Companies are separate from saved Power companies).
 */
export interface SavedContact {
  id: string
  group_key: ContactGroup
  role_label: string
  name: string
  phone: string | null
  email: string | null
  photo_url: string | null
  sort_order: number
}

export interface Lender {
  name: string | null
  company: string | null
  license: string | null
  headshot_url: string | null
  phone: string | null
  email: string | null
  is_in_house: boolean
  /** Only populated when is_in_house (sourced from the roster) — a typed-in
   *  outside lender has no team_member row to pull these from. */
  website_1?: string | null
  website_2?: string | null
  website_3?: string | null
  nmls_number?: string | null
}

export interface Milestone {
  id: string
  side: Side
  label: string
  has_date: boolean
  date_value: string | null
  is_complete: boolean
  sort_order: number
  is_rail_step: boolean
  rail_label: string | null
}

export interface DocLine {
  id: string
  group_key: DocGroup
  text: string
  is_checked: boolean
  sort_order: number
}

export interface Contact {
  id: string
  group_key: ContactGroup
  role_label: string
  name: string | null
  phone: string | null
  email: string | null
  note: string | null
  photo_url: string | null
  sort_order: number
}

export interface Transaction {
  id: string
  deal_type: DealType
  address_line: string
  city_state_zip: string
  photo_url: string | null
  status: TxStatus
  status_note: string | null
  closing_date: string | null
  closed_and_funded: boolean
  closed_and_funded_date: string | null
  offer_price: number | null
  contingencies_addendums: string | null
  final_purchase_price: number | null
  lender: Lender
  /** Which roster member is shown as "Realtor." Picked in Settings › Team roster. */
  realtor_member_id: string | null
  /** The title shown on the agent's card — some of her people go by "Broker
   *  Associate" instead, and it can vary by transaction, not just by person. */
  realtor_title: 'realtor' | 'broker_associate'
  /** Same idea for the loan side: "Loan Officer" or "Mortgage Broker." */
  lender_title: 'loan_officer' | 'mortgage_broker'
  /** Which roster member is shown as the lender — same pattern as Realtor.
   *  Null on older transactions where a lender was typed in by hand. */
  lender_member_id: string | null
  /** "Home info" section — client-visible, sourced from the MLS listing and
   *  flagged as needing verification (see Dashboard.tsx). Text, not numeric:
   *  HOA/tax are usually written as "$250/mo" or "$4,200/yr est." */
  listing_url: string | null
  hoa_fee: string | null
  property_tax: string | null
  school_district: string | null
  county: string | null
}

/** A dated entry on a transaction's message board — one log per side, never
 *  overwritten, so it reads back as a history rather than a single note. */
export interface Note {
  id: string
  side: Side
  author_name: string | null
  body: string
  created_at: string
}

/** Exactly what get_shared_transaction() returns. */
export interface SharedPayload {
  transaction: Transaction
  realtor: Person | null
  brands: Partial<Record<BrandKind, Brand>>
  milestones: Milestone[]
  doc_lines: DocLine[]
  contacts: Contact[]
  notes: Note[]
}

export type BudgetRange =
  | 'Under $200k' | '$200k–$300k' | '$300k–$400k' | '$400k–$500k' | '$500k–$750k' | '$750k–$1M' | '$1M+'

export const BUDGET_RANGES: BudgetRange[] =
  ['Under $200k', '$200k–$300k', '$300k–$400k', '$400k–$500k', '$500k–$750k', '$750k–$1M', '$1M+']

export type ReferralSource =
  | 'EPIC provided' | 'Personal Referral' | 'Agent Referral' | 'Lead IO' | 'Realtor.com'

export const REFERRAL_SOURCES: ReferralSource[] =
  ['EPIC provided', 'Personal Referral', 'Agent Referral', 'Lead IO', 'Realtor.com']

export type LoanType = 'Conventional' | 'FHA' | 'VA' | 'USDA' | 'Jumbo' | 'Other'
export const LOAN_TYPES: LoanType[] = ['Conventional', 'FHA', 'VA', 'USDA', 'Jumbo', 'Other']

export type LoanStatus =
  | 'Not started' | 'Application submitted' | 'In underwriting' | 'Clear to close' | 'Denied'
export const LOAN_STATUSES: LoanStatus[] =
  ['Not started', 'Application submitted', 'In underwriting', 'Clear to close', 'Denied']

/**
 * An active buyer who hasn't found (or gone under contract on) a home yet.
 * Lighter than a Transaction on purpose — no address, no closing date, no
 * loan side. `convert_lead_to_transaction()` promotes one into a real
 * Transaction once they're under contract.
 */
export interface Lead {
  id: string
  team_id: string
  share_token: string
  full_name: string
  /** Second buyer's name — a couple is the common case. Optional. */
  full_name_2: string | null
  /** Independent — a client can want either, or both. All the pre-contract
   *  house-hunting sections (timeframe, homes, appointments, etc.) only
   *  matter when wants_buying is true; the Loan Info section only shows
   *  when wants_loan is true. One record either way, never two to merge. */
  wants_buying: boolean
  wants_loan: boolean
  loan_type: LoanType | null
  estimated_loan_amount: number | null
  loan_status: LoanStatus | null
  phone: string | null
  email: string | null
  phone_2: string | null
  email_2: string | null
  /** Uploaded by the client themselves, from their own page. One per name slot. */
  client_photo_url: string | null
  client_photo_url_2: string | null
  /** Which of the two names is the main point of contact. Internal only. */
  primary_contact: '1' | '2'
  realtor_member_id: string | null
  lender_member_id: string | null
  /** Anchored to created_at, not "today" — see migration 020. Recomputed
   *  live on the frontend so the color-coded urgency dot ages on its own. */
  timeframe_bucket: '0-3' | '3-6' | '6+' | null
  buyer_broker_signed: boolean
  buyer_broker_signed_date: string | null
  buyer_broker_expires: string | null
  referral_source: ReferralSource | null
  /** Only meaningful when referral_source is 'Agent Referral'. */
  referral_brokerage_name: string | null
  referral_brokerage_address: string | null
  referral_contact_info: string | null
  referral_commission_pct: number | null
  referral_doc_received: boolean
  /** These three apply no matter which referral_source is picked, not just
   *  Agent Referral — internal only, same as the rest of this section. */
  referral_met_exp_cap: boolean | null
  referral_epic_split_pct: string | null
  referral_transaction_fee: boolean
  referral_transaction_fee_amount: number | null
  referral_notes: string | null
  preapproval_on_file: boolean
  budget: BudgetRange | null
  communities: string | null
  likes: string | null
  dislikes: string | null
  purchase_type: 'investment' | 'personal' | null
  funding_type: 'cash' | 'financing' | null
  has_house_to_sell: boolean
  why_selling: string | null
  general_notes: string | null
  converted_transaction_id: string | null
  /** 'active' until converted, 'under_contract' once a transaction exists,
   *  'closed' once that transaction is marked Closed & Funded. Independent
   *  of archived_at — a converted/closed lead stays visible on purpose. */
  lead_status: 'active' | 'under_contract' | 'closed'
  closed_date: string | null
  created_at: string
  archived_at: string | null
}

export const LEAD_STATUS_LABEL: Record<Lead['lead_status'], string> = {
  active: 'Active buyer',
  under_contract: 'Under contract',
  closed: 'Closed',
}

export interface LeadAppointment {
  id: string
  lead_id: string
  scheduled_at: string | null
  address_line: string
  city_state_zip: string | null
  url: string | null
  photo_url: string | null
  note: string | null
  /** Whether the showing actually happened — drives "move to Homes shown". */
  completed: boolean
  sort_order: number
}

export interface LeadHome {
  id: string
  lead_id: string
  address_line: string
  city_state_zip: string | null
  price: string | null
  url: string | null
  photo_url: string | null
  /** Client-visible. */
  note: string | null
  /** Allison's read on the client's reaction — internal only, never part of get_shared_lead(). */
  private_note: string | null
  /** When this home was actually toured — carried over from the appointment
   *  it came from, or set directly if added without one. */
  shown_at: string | null
  /** Client clicked "Let's make an offer!" on this home. */
  offer_requested: boolean
  sort_order: number
}

/** A candidate home, not yet confirmed as shown — same client visibility as LeadHome. */
export interface LeadMaybeHome {
  id: string
  lead_id: string
  address_line: string
  city_state_zip: string | null
  url: string | null
  photo_url: string | null
  /** Client-visible. */
  note: string | null
  /** Internal only, never part of get_shared_lead(). */
  private_note: string | null
  /** Set by the client themselves, from their own page — see request-showing. */
  showing_requested: boolean
  showing_requested_at: string | null
  sort_order: number
}

export interface LeadPriority {
  id: string
  lead_id: string
  text: string
  sort_order: number
}

export interface LeadPersonalNote {
  id: string
  lead_id: string
  text: string
  /** Birthdays, anniversaries, etc. Optional — not every line needs a date. */
  date_value: string | null
  sort_order: number
}

/** Someone the buyer (or the agent, on their behalf) has referred. */
export interface LeadReferral {
  id: string
  lead_id: string
  name: string
  phone: string | null
  email: string | null
  submitted_by: 'agent' | 'client'
  created_at: string
}

export interface LeadDocument {
  id: string
  lead_id: string
  file_name: string
  file_url: string
  storage_path: string
  created_at: string
}

export interface LeadNote {
  id: string
  author_name: string | null
  body: string
  created_at: string
}

/** Months from "add date" that each bucket estimates as the ready date. */
const TIMEFRAME_BUCKET_MONTHS: Record<NonNullable<Lead['timeframe_bucket']>, number> = {
  '0-3': 3, '3-6': 6, '6+': 9,
}

export type TimeframeBand = 'green' | 'yellow' | 'orange'

// Brighter/more saturated than the app's usual muted gold palette on
// purpose — this needs to read clearly as a small dot, not blend in.
// Picked for maximum contrast from each other, not just from the app's own
// gold accent — yellow and orange are both warm hues and can read as "the
// same color" at a glance if they're too close in saturation/lightness, so
// these lean toward opposite ends (bright/light green, deep gold, red-orange).
export const TIMEFRAME_BAND_COLOR: Record<TimeframeBand, string> = {
  green: '#2ecc40', yellow: '#d4a017', orange: '#cc3311',
}
export const TIMEFRAME_BAND_LABEL: Record<TimeframeBand, string> = {
  green: 'Ready now / within 3 months',
  yellow: '3–6 months out',
  orange: 'More than 6 months out',
}

/**
 * Recomputed live, not stored — created_at is fixed and "today" isn't, so
 * calling this on every render is what makes a lead's dot creep from orange
 * to green over time with no update from anyone. See migration 020.
 */
export function leadTimeframeBand(lead: Pick<Lead, 'created_at' | 'timeframe_bucket'>): TimeframeBand | null {
  if (!lead.timeframe_bucket) return null
  const readyBy = new Date(lead.created_at)
  readyBy.setMonth(readyBy.getMonth() + TIMEFRAME_BUCKET_MONTHS[lead.timeframe_bucket])

  // Compare against calendar-month marks, not a days/30.44 average — mixing
  // setMonth() (which lands on real calendar dates of varying length) with a
  // fixed day-average caused a freshly-picked "3–6 months" bucket to land on
  // "orange" instead of "yellow" whenever the actual 6-month span happened
  // to be longer than 30.44*6 days (i.e. most of the time).
  const threeMonthMark = new Date()
  threeMonthMark.setMonth(threeMonthMark.getMonth() + 3)
  const sixMonthMark = new Date()
  sixMonthMark.setMonth(sixMonthMark.getMonth() + 6)

  if (readyBy <= threeMonthMark) return 'green'
  if (readyBy <= sixMonthMark) return 'yellow'
  return 'orange'
}

/**
 * Real estate listing sites (eXp's agent site template among them) commonly
 * bake the address straight into the URL slug, e.g.
 * ".../property/24-A4680585-3990-higel-avenue-sarasota-FL-34242" — street
 * number, street name, city, state, zip, all right there. Parsing that
 * needs no network request at all, which matters specifically because these
 * same sites tend to sit behind Cloudflare's bot challenge — a plain
 * fetch() never gets past that to read the page itself, but the URL is
 * already in hand before any fetch would even happen.
 *
 * Heuristic: state is the second-to-last hyphen segment (2 letters), zip is
 * the last (5 digits); an MLS ID segment (a letter followed by 4+ digits,
 * e.g. "A4680585") marks where the real address starts, skipping whatever
 * listing-ID segments came before it. The last remaining word is taken as
 * the city — right for the common single-word-city case, wrong for a
 * multi-word city (rare enough not to special-case here).
 */
export function parseAddressFromListingUrl(url: string): { street: string; cityStateZip: string } | null {
  let path: string
  try { path = new URL(url).pathname } catch { return null }

  const slug = path.split('/').filter(Boolean).pop()
  if (!slug) return null

  const parts = slug.split('-').filter(Boolean)
  if (parts.length < 4) return null

  const zip = parts[parts.length - 1]
  const state = parts[parts.length - 2]
  if (!/^\d{5}$/.test(zip) || !/^[A-Za-z]{2}$/.test(state)) return null

  const rest = parts.slice(0, -2)
  const mlsIdx = rest.findIndex((p) => /^[A-Za-z]\d{4,}$/.test(p))
  const addressParts = mlsIdx >= 0 ? rest.slice(mlsIdx + 1) : rest
  if (addressParts.length < 2) return null

  const city = addressParts[addressParts.length - 1]
  const streetParts = addressParts.slice(0, -1)
  const titleCase = (w: string) => (/^\d+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))

  return {
    street: streetParts.map(titleCase).join(' '),
    cityStateZip: `${titleCase(city)}, ${state.toUpperCase()} ${zip}`,
  }
}

/** Exactly what get_shared_lead() returns. */
export interface SharedLeadPayload {
  lead: {
    id: string; full_name: string; full_name_2: string | null
    client_photo_url: string | null; client_photo_url_2: string | null
    wants_buying: boolean
    wants_loan: boolean
    loan_type: LoanType | null
    loan_status: LoanStatus | null
    preapproval_on_file: boolean
    budget: BudgetRange | null
    purchase_type: 'investment' | 'personal' | null
    funding_type: 'cash' | 'financing' | null
    has_house_to_sell: boolean
    why_selling: string | null
  }
  realtor: Person | null
  brand: Brand | null
  appointments: LeadAppointment[]
  homes: LeadHome[]
  maybe_homes: LeadMaybeHome[]
  priorities: LeadPriority[]
  notes: LeadNote[]
}
