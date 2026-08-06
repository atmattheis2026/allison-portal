export type DealType = 'buy' | 'sell'
export type Side = 'real_estate' | 'loan'
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
}

export interface Person {
  full_name: string
  license_number: string | null
  headshot_url: string | null
  phone: string | null
  email: string | null
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
}

/** Exactly what get_shared_transaction() returns. */
export interface SharedPayload {
  transaction: Transaction
  realtor: Person | null
  brands: Partial<Record<BrandKind, Brand>>
  milestones: Milestone[]
  doc_lines: DocLine[]
  contacts: Contact[]
}
