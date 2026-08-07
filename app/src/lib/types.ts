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
  admin: 'Office manager',
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
