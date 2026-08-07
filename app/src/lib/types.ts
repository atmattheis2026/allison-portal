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
  phone: string | null
  email: string | null
  realtor_member_id: string | null
  /** Anchored to created_at, not "today" — see migration 020. Recomputed
   *  live on the frontend so the color-coded urgency dot ages on its own. */
  timeframe_bucket: '0-3' | '3-6' | '6+' | null
  buyer_broker_signed: boolean
  buyer_broker_expires: string | null
  referral_source: ReferralSource | null
  /** Only meaningful when referral_source is 'Agent Referral'. */
  referral_brokerage_name: string | null
  referral_brokerage_address: string | null
  referral_contact_info: string | null
  referral_commission_pct: number | null
  referral_doc_received: boolean
  preapproval_on_file: boolean
  budget: BudgetRange | null
  communities: string | null
  likes: string | null
  dislikes: string | null
  purchase_type: 'investment' | 'personal' | null
  funding_type: 'cash' | 'financing' | null
  has_house_to_sell: boolean
  why_selling: string | null
  friends_family_referrals: string | null
  general_notes: string | null
  converted_transaction_id: string | null
  created_at: string
  archived_at: string | null
}

export interface LeadAppointment {
  id: string
  lead_id: string
  scheduled_at: string | null
  address_line: string
  note: string | null
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
  sort_order: number
}

/** A candidate home, not yet confirmed as shown — same client visibility as LeadHome. */
export interface LeadMaybeHome {
  id: string
  lead_id: string
  address_line: string
  url: string | null
  photo_url: string | null
  /** Client-visible. */
  note: string | null
  /** Internal only, never part of get_shared_lead(). */
  private_note: string | null
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
export const TIMEFRAME_BAND_COLOR: Record<TimeframeBand, string> = {
  green: '#22c55e', yellow: '#facc15', orange: '#f97316',
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
  const monthsLeft = (readyBy.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44)
  if (monthsLeft <= 3) return 'green'
  if (monthsLeft <= 6) return 'yellow'
  return 'orange'
}

/** Exactly what get_shared_lead() returns. */
export interface SharedLeadPayload {
  lead: { id: string; full_name: string }
  realtor: Person | null
  brand: Brand | null
  appointments: LeadAppointment[]
  homes: LeadHome[]
  maybe_homes: LeadMaybeHome[]
  priorities: LeadPriority[]
  notes: LeadNote[]
}
