import { useState, type ReactNode } from 'react'
import type {
  SharedPayload, Milestone, Side, Brand, BrandKind, DocGroup, Contact,
  Transaction, TxStatus, TeamMember, Note, SavedContact,
} from '../lib/types'
import { STATUS_LABEL } from '../lib/types'
import './Dashboard.css'

/* ------------------------------------------------------------------ helpers */

/**
 * Read once, for choosing a section's INITIAL open state only.
 *
 * Deliberately not reactive. Layout switching is done entirely in CSS — see the
 * note on Rail and Section below. An earlier version drove the layout from a
 * matchMedia hook, and a stale value meant the progress rail rendered its phone
 * markup while CSS was hiding phone markup, so the rail vanished completely.
 * Anything that can go stale must not decide whether an element exists.
 */
function isWideNow(breakpoint = 900) {
  return typeof window !== 'undefined' && window.innerWidth >= breakpoint
}

/** Dates are stored as plain YYYY-MM-DD. Parse them as local, never UTC —
 *  `new Date('2026-07-26')` is midnight UTC and shows as the 25th in Florida. */
function parseLocal(d: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

function fmtShort(d: string | null): string {
  if (!d) return ''
  return parseLocal(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
}

function fmtLong(d: string): string {
  return parseLocal(d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function daysUntil(d: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = parseLocal(d)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function telHref(p: string) { return `tel:${p.replace(/[^\d+]/g, '')}` }

/* ------------------------------------------------------------------ props */

export interface DashboardHandlers {
  onToggleMilestone?: (m: Milestone) => void
  onChangeMilestoneDate?: (m: Milestone, value: string | null) => void
  onToggleDocLine?: (id: string, checked: boolean) => void
  onChangeDocLine?: (id: string, text: string) => void
  /** Header fields: address, city, closing date, status, lender. */
  onPatchTransaction?: (values: Partial<Transaction>) => void
  onPatchContact?: (id: string, values: Partial<Contact>) => void
  onUploadPhoto?: (file: File) => void
  /** Picking the realtor and loan officer from her roster — same pattern for both. */
  onChangeRealtor?: (memberId: string | null) => void
  onPickLender?: (memberId: string) => void
  onAddNote?: (side: Side, body: string) => void
  /** Best-effort auto-fill of HOA/tax/school district/county from a pasted
   *  listing link. Lives on the parent (needs Supabase access), not here. */
  onFetchListingPreview?: (url: string) => void
  onPickSavedContact?: (contactId: string, savedId: string) => void
  onSaveContact?: (contact: Contact) => void
  onUploadContactPhoto?: (contactId: string, file: File) => void
  /** Agent-only contacts (buyer/seller TC, title closer/processor, and any
   *  free-typed extras) — never part of the client payload. */
  onPatchInternalContact?: (id: string, values: Partial<Contact>) => void
  onAddInternalContact?: () => void
  onRemoveInternalContact?: (id: string) => void
  onUploadInternalContactPhoto?: (contactId: string, file: File) => void
}

interface Props extends DashboardHandlers {
  data: SharedPayload
  editable?: boolean
  /** Right-hand note in the brand bar. */
  viewNote?: string
  headerExtra?: ReactNode
  /** Her team roster, for picking a realtor. Admin-only — not part of the
   *  client payload, so this is undefined on the client-facing page. */
  roster?: TeamMember[]
  /** Saved vendors for the Contacts section — title companies, inspectors,
   *  utilities. Same admin-only story as roster. */
  savedContacts?: SavedContact[]
  /** Contacts flagged internal_only — fetched separately since
   *  get_shared_transaction() excludes them. Same admin-only story as
   *  roster: undefined on the client-facing page, so the section that
   *  reads this never renders there. */
  internalContacts?: Contact[]
}

/* ------------------------------------------------------------------ main */

export default function Dashboard({
  data, editable = false, viewNote = 'Transaction Portal · Client View',
  headerExtra, roster, savedContacts, internalContacts, ...h
}: Props) {
  const { transaction: tx, realtor, brands, milestones, doc_lines, contacts, notes } = data

  const reBrand = brands.real_estate
  const lendBrand = brands.lending
  // A loan-only deal (a refinance, or any loan she's helping with where she
  // isn't the agent) has no real estate side at all — just the loan checklist.
  const isLoanOnly = tx.deal_type === 'loan'
  const hasLoan = (tx.deal_type === 'buy' || isLoanOnly) && milestones.some((m) => m.side === 'loan')
  const showRealEstateCol = !isLoanOnly
  const threeCol = showRealEstateCol && hasLoan

  // Brand colors drive the CSS variables, so a color change in Settings
  // repaints the whole page with no code change.
  const styleVars: React.CSSProperties & Record<string, string> = {} as never
  if (reBrand?.accent_hex) styleVars['--gold'] = reBrand.accent_hex
  if (lendBrand?.accent_hex) styleVars['--lend'] = lendBrand.accent_hex

  const railSteps = milestones
    .filter((m) => m.side === (isLoanOnly ? 'loan' : 'real_estate') && m.is_rail_step)
    .sort((a, b) => a.sort_order - b.sort_order)
  const firstOpen = railSteps.findIndex((s) => !s.is_complete)
  const currentIdx = firstOpen === -1 ? railSteps.length : firstOpen

  return (
    <div className="dash" style={styleVars}>
      <BrandBar brand={reBrand} viewNote={viewNote} extra={headerExtra} />

      {/* One markup for both sizes. `topgrid` is a plain stack on phones and a
          three-up row at 900px, so nothing here depends on a JS width value. */}
      <div className="topgrid">
        <Hero tx={tx} editable={editable} onUploadPhoto={h.onUploadPhoto}
              onPatch={h.onPatchTransaction} />
        <div className="headline">
          <AddressBlock tx={tx} editable={editable} onPatch={h.onPatchTransaction} />
          <div className="statusrow">
            <StatusPill tx={tx} editable={editable} onPatch={h.onPatchTransaction} />
          </div>
        </div>
        {(tx.closing_date || editable) && (
          <div className="countdownPhone">
            <Countdown date={tx.closing_date} editable={editable}
                       onPatch={h.onPatchTransaction} />
          </div>
        )}
        <TeamCards realtor={realtor} lender={tx.lender} roster={roster}
                   realtorMemberId={tx.realtor_member_id} lenderMemberId={tx.lender_member_id}
                   hideRealtor={isLoanOnly}
                   realtorTitle={tx.realtor_title} lenderTitle={tx.lender_title}
                   editable={editable} onPatch={h.onPatchTransaction}
                   onChangeRealtor={h.onChangeRealtor}
                   onPickLender={h.onPickLender} />
      </div>

      {railSteps.length > 0 && <Rail steps={railSteps} currentIdx={currentIdx} />}

      <div className={`sections${threeCol ? '' : ' twocol'}`}>
        {showRealEstateCol && (
          <div className="col">
            <ChecklistSection
              title="Real Estate" side="real_estate" milestones={milestones}
              docLines={[]} editable={editable} defaultOpen {...h}
            />
          </div>
        )}

        <div className="col">
          {(tx.closing_date || editable) && (
            <div className="countdownDesk">
              <Countdown date={tx.closing_date} editable={editable}
                         onPatch={h.onPatchTransaction} />
            </div>
          )}
          {showRealEstateCol && (
            <HomeInfoSection tx={tx} editable={editable} onPatch={h.onPatchTransaction}
                             onFetchListingPreview={h.onFetchListingPreview} />
          )}
          {showRealEstateCol && (
            <NotesBoard title="Real Estate Updates" side="real_estate" notes={notes}
                        editable={editable} onAdd={h.onAddNote} />
          )}
          {hasLoan && (
            <NotesBoard title="Loan Updates" side="loan" notes={notes} lending
                        editable={editable} onAdd={h.onAddNote} />
          )}
          <ContactsSection contacts={contacts} editable={editable}
                           savedContacts={savedContacts}
                           onPatch={h.onPatchContact}
                           onPickSaved={h.onPickSavedContact}
                           onSaveContact={h.onSaveContact}
                           onUploadContactPhoto={h.onUploadContactPhoto} />
          {editable && internalContacts && (
            <AgentOnlyContactsSection contacts={internalContacts}
                                      onPatch={h.onPatchInternalContact}
                                      onAdd={h.onAddInternalContact}
                                      onRemove={h.onRemoveInternalContact}
                                      onUploadContactPhoto={h.onUploadInternalContactPhoto} />
          )}
        </div>

        {hasLoan && (
          <div className="col">
            <ChecklistSection
              title="Loan" side="loan" milestones={milestones}
              docLines={doc_lines} lending brand={lendBrand}
              editable={editable} {...h}
            />
          </div>
        )}
      </div>

      <Disclaimers brands={brands} />
    </div>
  )
}

/* ------------------------------------------------------------------ pieces */

/**
 * Compliance footer. Each company carries its own required language — brokerage
 * identification and Equal Housing on one side, NMLS numbers on the other — so
 * both render, labelled, rather than being merged into one blob.
 *
 * Renders nothing until she fills these in. An empty footer is correct; invented
 * legal text would not be.
 */
function Disclaimers({ brands }: { brands: Partial<Record<BrandKind, Brand>> }) {
  const entries = (['real_estate', 'lending'] as const)
    .map((k) => [k, brands[k]] as const)
    .filter(([, b]) => b?.disclaimer_text?.trim())

  if (entries.length === 0) return null

  return (
    <footer className="disclaimers">
      {entries.map(([kind, b]) => (
        <div className={`disc${kind === 'lending' ? ' lending' : ''}`} key={kind}>
          {b!.name && <div className="discwho">{b!.name}</div>}
          <p>{b!.disclaimer_text}</p>
        </div>
      ))}
    </footer>
  )
}

/**
 * Listing link + HOA/tax/school district/county. Pasting the link tries to
 * fill the rest in automatically (see fetch-link-preview) — best-effort,
 * since this data usually isn't in a simple meta tag the way a photo is.
 * Whatever doesn't come back gets typed in by hand, same as everything
 * else on this page.
 */
function HomeInfoSection({ tx, editable, onPatch, onFetchListingPreview }: {
  tx: Transaction; editable: boolean
  onPatch?: (v: Partial<Transaction>) => void
  onFetchListingPreview?: (url: string) => void
}) {
  const hasAnyFact = tx.hoa_fee || tx.property_tax || tx.school_district || tx.county || tx.listing_url
  if (!editable && !hasAnyFact) return null

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--panel-2)', border: '1px solid var(--line)',
    borderRadius: 6, padding: '8px 10px', font: 'inherit', color: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-faint, #8a8578)',
    display: 'block', marginBottom: 4,
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 className="eyebrow">Home Info</h3>
      {editable ? (
        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          <div>
            <label style={labelStyle}>Listing link</label>
            <input style={inputStyle} value={tx.listing_url ?? ''} placeholder="Paste the MLS/Zillow listing link"
                   onChange={(e) => onPatch?.({ listing_url: e.target.value })}
                   onBlur={(e) => { if (e.target.value) onFetchListingPreview?.(e.target.value) }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>HOA</label>
              <input style={inputStyle} value={tx.hoa_fee ?? ''} placeholder="e.g. $250/mo"
                     onChange={(e) => onPatch?.({ hoa_fee: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Property tax</label>
              <input style={inputStyle} value={tx.property_tax ?? ''} placeholder="e.g. $4,200/yr"
                     onChange={(e) => onPatch?.({ property_tax: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>School district</label>
              <input style={inputStyle} value={tx.school_district ?? ''}
                     onChange={(e) => onPatch?.({ school_district: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>County</label>
              <input style={inputStyle} value={tx.county ?? ''}
                     onChange={(e) => onPatch?.({ county: e.target.value })} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6, marginTop: 8, fontSize: 14 }}>
          {tx.hoa_fee && <div><strong>HOA:</strong> {tx.hoa_fee}</div>}
          {tx.property_tax && <div><strong>Property tax:</strong> {tx.property_tax}</div>}
          {tx.school_district && <div><strong>School district:</strong> {tx.school_district}</div>}
          {tx.county && <div><strong>County:</strong> {tx.county}</div>}
          {tx.listing_url && (
            <div><a href={tx.listing_url} target="_blank" rel="noreferrer">View original listing</a></div>
          )}
        </div>
      )}
      <p className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
        This information was provided by the MLS listing and needs to be verified for accuracy.
      </p>
    </div>
  )
}

function BrandBar({ brand, viewNote, extra }: {
  brand?: Brand; viewNote: string; extra?: ReactNode
}) {
  const light = brand?.needs_light_background
  const logo = light ? brand?.logo_light_url || brand?.logo_url : brand?.logo_url
  return (
    <div className={`brandbar${light ? ' lightband' : ''}`}>
      {logo
        ? <img src={logo} alt={brand?.name || ''} />
        : <span className="wordmark">{brand?.wordmark_text || brand?.name || 'Your Company'}</span>}
      {extra ?? <span className="viewnote">{viewNote}</span>}
    </div>
  )
}

/**
 * Edits happen in place rather than in a separate form, so the thing she is
 * changing is the thing her client will see. Inputs are styled to look like the
 * finished text until focused.
 */
function EditableText({ value, onCommit, placeholder, className }: {
  value: string; onCommit: (v: string) => void
  placeholder?: string; className?: string
}) {
  const [draft, setDraft] = useState(value)
  // Resync when the row is replaced underneath us (a reload, or another edit).
  const [seen, setSeen] = useState(value)
  if (seen !== value) { setSeen(value); setDraft(value) }

  return (
    <input
      className={`inlineEdit ${className ?? ''}`}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur() }
      }}
    />
  )
}

/** The overlaid address is for the phone layout; CSS hides it at desktop, where
 *  the address sits beside the photo instead. */
function Hero({ tx, editable, onUploadPhoto, onPatch }: {
  tx: Transaction; editable: boolean
  onUploadPhoto?: (f: File) => void
  onPatch?: (v: Partial<Transaction>) => void
}) {
  return (
    <div className={`hero${tx.photo_url ? '' : ' noPhoto'}`}>
      {tx.photo_url && <img src={tx.photo_url} alt={tx.address_line} />}
      {editable && (
        <label className="photoSwap">
          <input type="file" accept="image/*" style={{ display: 'none' }}
                 onChange={(e) => {
                   const f = e.target.files?.[0]
                   if (f) onUploadPhoto?.(f)
                 }} />
          {tx.photo_url ? 'Change photo' : 'Add a photo'}
        </label>
      )}
      {/* The phone layout's address. It has to be editable too — .headline is
          display:none on a phone, so without this she could not fix an address
          from the device she'll actually have at a closing table. */}
      <div className="heroText">
        <AddressBlock tx={tx} editable={editable} onPatch={onPatch} />
      </div>
    </div>
  )
}

function AddressBlock({ tx, editable, onPatch }: {
  tx: Transaction; editable: boolean; onPatch?: (v: Partial<Transaction>) => void
}) {
  if (!editable) {
    return (
      <>
        <h1 className="address">{tx.address_line || 'Untitled property'}</h1>
        <div className="cityline">{tx.city_state_zip}</div>
      </>
    )
  }
  return (
    <>
      <EditableText className="address" value={tx.address_line}
                    placeholder="Street address"
                    onCommit={(v) => onPatch?.({ address_line: v })} />
      <EditableText className="cityline" value={tx.city_state_zip}
                    placeholder="City, State ZIP"
                    onCommit={(v) => onPatch?.({ city_state_zip: v })} />
    </>
  )
}

const STATUSES: TxStatus[] =
  ['under_contract', 'on_track', 'attention', 'closed', 'fell_through']

function StatusPill({ tx, editable, onPatch }: {
  tx: Transaction; editable?: boolean; onPatch?: (v: Partial<Transaction>) => void
}) {
  const attention = tx.status === 'attention' || tx.status === 'fell_through'

  if (!editable) {
    return (
      <span className={`pill${attention ? ' attention' : ''}`}>
        <span className="dot">{attention ? '!' : '✓'}</span>
        {tx.status_note || STATUS_LABEL[tx.status]}
      </span>
    )
  }

  return (
    <span className="statusEdit">
      <span className={`pill${attention ? ' attention' : ''}`}>
        <span className="dot">{attention ? '!' : '✓'}</span>
        <select value={tx.status}
                onChange={(e) => onPatch?.({ status: e.target.value as TxStatus })}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </span>
      <EditableText className="statusNote" value={tx.status_note ?? ''}
                    placeholder="Add your own wording (optional)"
                    onCommit={(v) => onPatch?.({ status_note: v || null })} />
    </span>
  )
}

function Countdown({ date, editable, onPatch }: {
  date: string | null; editable?: boolean; onPatch?: (v: Partial<Transaction>) => void
}) {
  const days = date ? daysUntil(date) : null
  const past = days !== null && days < 0

  return (
    <div className="countdown">
      <div className="num">{days === null ? '—' : past ? '✓' : days}</div>
      <div className="rt">
        <div className="lab">Closing day</div>
        <div className="unit">
          {days === null ? 'Not set'
            : past ? 'Closed'
            : days === 0 ? 'Today!'
            : days === 1 ? 'day away' : 'days away'}
        </div>
        {editable ? (
          <input className="closingInput" type="date" value={date ?? ''}
                 onChange={(e) => onPatch?.({ closing_date: e.target.value || null })} />
        ) : (
          <div className="when">{date ? fmtLong(date) : ''}</div>
        )}
      </div>
    </div>
  )
}

function TeamCards({
  realtor, lender, roster, realtorMemberId, lenderMemberId, hideRealtor, realtorTitle, lenderTitle,
  editable, onPatch, onChangeRealtor, onPickLender,
}: {
  realtor: SharedPayload['realtor']; lender: Transaction['lender']
  roster?: TeamMember[]; realtorMemberId?: string | null; lenderMemberId?: string | null
  hideRealtor?: boolean
  realtorTitle?: Transaction['realtor_title']; lenderTitle?: Transaction['lender_title']
  editable?: boolean
  onPatch?: (v: Partial<Transaction>) => void
  onChangeRealtor?: (memberId: string | null) => void
  onPickLender?: (memberId: string) => void
}) {
  const realtorLabel = realtorTitle === 'broker_associate' ? 'Broker Associate' : 'Realtor'
  const lenderLabel = lenderTitle === 'mortgage_broker' ? 'Mortgage Broker' : 'Loan Officer'
  const hasLender = Boolean(lender?.name)
  const agents = roster?.filter((m) => m.roles.includes('realtor')) ?? []
  const loanPeople = roster?.filter((m) =>
    m.roles.includes('loan_officer') || m.roles.includes('mortgage_broker')) ?? []
  if (hideRealtor && !hasLender && !editable) return null
  if (!hideRealtor && !realtor && !hasLender && !editable) return null

  return (
    <div className="team">
      {/* Realtor is picked from her roster (Settings › Team), not typed per deal —
          that's what makes the headshot and license follow her automatically
          everywhere she's the realtor, instead of retyping it every transaction.
          Hidden entirely on loan-only deals, which have no agent at all. */}
      {!hideRealtor && (editable ? (
        <div className="person">
          <Avatar src={realtor?.headshot_url ?? null} name={realtor?.full_name || ''} />
          <div className="who">
            <button
              type="button" className="role" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'block', textAlign: 'left' }}
              title="Click to switch between Realtor and Broker Associate"
              onClick={() => onPatch?.({
                realtor_title: realtorTitle === 'broker_associate' ? 'realtor' : 'broker_associate',
              })}
            >
              {realtorLabel} ⇄
            </button>
            <select
              className="name"
              style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', padding: 0 }}
              value={realtorMemberId ?? ''}
              onChange={(e) => onChangeRealtor?.(e.target.value || null)}
            >
              <option value="">Choose a realtor…</option>
              {agents.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name || 'Unnamed'}</option>
              ))}
            </select>
            {realtor?.license_number && <div className="lic">{realtor.license_number}</div>}
            {!agents.length && (
              <div className="lic" style={{ opacity: .7 }}>
                Tag people "Agent" in Settings › Team first
              </div>
            )}
          </div>
        </div>
      ) : realtor && (
        <div className="person">
          <Avatar src={realtor.headshot_url} name={realtor.full_name} />
          <div className="who">
            <div className="role">{realtorLabel}</div>
            <div className="name">{realtor.full_name}</div>
            {realtor.license_number && <div className="lic">{realtor.license_number}</div>}
            {[realtor.website_1, realtor.website_2, realtor.website_3].filter(Boolean).map((w, i) => (
              <a key={i} href={w!} target="_blank" rel="noreferrer" className="lic" style={{ display: 'block' }}>
                {w}
              </a>
            ))}
          </div>
        </div>
      ))}

      {/* Loan officer is picked from her roster, same as Realtor — her loan
          people are her own team, not outside lenders, so this never needs
          retyping either. */}
      {editable ? (
        <div className="person lend">
          <Avatar src={lender.headshot_url} name={lender.name || ''} />
          <div className="who">
            <button
              type="button" className="role" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'block', textAlign: 'left' }}
              title="Click to switch between Loan Officer and Mortgage Broker"
              onClick={() => onPatch?.({
                lender_title: lenderTitle === 'mortgage_broker' ? 'loan_officer' : 'mortgage_broker',
              })}
            >
              {lenderLabel} ⇄
            </button>
            <select
              className="name"
              style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', padding: 0 }}
              value={lenderMemberId ?? ''}
              onChange={(e) => { if (e.target.value) onPickLender?.(e.target.value) }}
            >
              <option value="">Choose from your team…</option>
              {loanPeople.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name || 'Unnamed'}</option>
              ))}
            </select>
            {lender.license && <div className="lic">{lender.license}</div>}
            {lender.company && <div className="lic">{lender.company}</div>}
            {lender.nmls_number && <div className="lic">NMLS #{lender.nmls_number}</div>}
            {!loanPeople.length && (
              <div className="lic" style={{ opacity: .7 }}>
                Tag people "Loan officer" in Settings › Team first
              </div>
            )}
          </div>
        </div>
      ) : hasLender && (
        <div className="person lend">
          <Avatar src={lender.headshot_url} name={lender.name || ''} />
          <div className="who">
            <div className="role">{lenderLabel}</div>
            <div className="name">{lender.name}</div>
            {lender.license && <div className="lic">{lender.license}</div>}
            {lender.company && <div className="lic">{lender.company}</div>}
            {lender.nmls_number && <div className="lic">NMLS #{lender.nmls_number}</div>}
            {[lender.website_1, lender.website_2, lender.website_3].filter(Boolean).map((w, i) => (
              <a key={i} href={w!} target="_blank" rel="noreferrer" className="lic" style={{ display: 'block' }}>
                {w}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) return <img className="avatar" src={src} alt={name} />
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]?.toUpperCase()).join('')
  return (
    <div className="avatar" style={{
      display: 'grid', placeItems: 'center',
      fontFamily: 'var(--serif)', fontSize: 15, color: 'var(--gold)',
    }}>{initials || '·'}</div>
  )
}

/**
 * Both orientations are rendered and CSS shows exactly one. Costs a dozen extra
 * DOM nodes and makes it impossible for a resize to leave the rail invisible.
 */
function Rail({ steps, currentIdx }: { steps: Milestone[]; currentIdx: number }) {
  const pct = steps.length < 2 ? 0 : (currentIdx / (steps.length - 1)) * 100
  const cls = (s: Milestone, i: number) =>
    s.is_complete ? ' done' : i === currentIdx ? ' current' : ''

  return (
    <div className="rail card">
      <h3 className="eyebrow">Where we are</h3>

      <div className="vsteps">
        {steps.map((s, i) => (
          <div key={s.id} className={`vstep${cls(s, i)}`}>
            <div className="spine" />
            <div className="node">{s.is_complete ? '✓' : i + 1}</div>
            <div>
              <div className="lbl">{s.rail_label || s.label}</div>
              {s.date_value && <div className="dt">{fmtShort(s.date_value)}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="hsteps" aria-hidden="true">
        <div className="track"><div className="fill2" style={{ width: `${pct}%` }} /></div>
        {steps.map((s, i) => (
          <div key={s.id} className={`hstep${cls(s, i)}`}>
            <div className="node">{s.is_complete ? '✓' : i + 1}</div>
            <div className="lbl">{s.rail_label || s.label}</div>
            <div className="dt">{fmtShort(s.date_value)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Collapsible on a phone, always open at desktop.
 *
 * Deliberately NOT a <details>. A closed <details> hides its content through the
 * element's own slot behaviour, which a media query cannot override — so at
 * desktop, where the chevron is hidden, a section left collapsed on a phone
 * became unreachable. A plain div plus a data attribute is something CSS can
 * actually win against.
 */
function Section({ title, brandMark, count, lending, defaultOpen, children }: {
  title: string; brandMark?: ReactNode; count?: string; lending?: boolean
  defaultOpen?: boolean; children: ReactNode
}) {
  const [open, setOpen] = useState(() => Boolean(defaultOpen) || isWideNow())

  return (
    <section className={`sec card${lending ? ' lending' : ''}`}>
      <button type="button" className="sechdr" onClick={() => setOpen((o) => !o)}
              aria-expanded={open}>
        <span className="sechead">
          <span className="sectitle">{title}</span>
          {brandMark && <span className="lendmark">{brandMark}</span>}
        </span>
        <span className="secright">
          {count && <span className="count">{count}</span>}
          <span className="chev">▼</span>
        </span>
      </button>
      <div className="secbody" data-open={open ? 'true' : 'false'}>{children}</div>
    </section>
  )
}

function ChecklistSection({
  title, side, milestones, docLines, lending, brand, editable, defaultOpen,
  onToggleMilestone, onChangeMilestoneDate, onToggleDocLine, onChangeDocLine,
}: {
  title: string; side: Side; milestones: Milestone[]; docLines: SharedPayload['doc_lines']
  lending?: boolean; brand?: Brand; editable: boolean; defaultOpen?: boolean
} & DashboardHandlers) {
  const items = milestones.filter((m) => m.side === side).sort((a, b) => a.sort_order - b.sort_order)
  const done = items.filter((m) => m.is_complete).length

  // Her two fill-in blocks hang off specific checkboxes.
  const groupAfter: Record<string, DocGroup> = {
    'Documentation on file': 'documentation',
    'Cleared conditions': 'conditions',
  }

  const mark = brand?.logo_url
    ? <img src={brand.logo_url} alt={brand.name} />
    : brand?.wordmark_text || brand?.name || null

  if (items.length === 0) {
    return (
      <Section title={title} count="" lending={lending} brandMark={mark}
               defaultOpen={defaultOpen}>
        <div className="emptynote">
          No checklist yet for this type of transaction.<br />
          Add the steps in <strong>Settings › Checklists</strong>.
        </div>
      </Section>
    )
  }

  return (
    <Section title={title} count={`${done} / ${items.length}`} lending={lending}
             brandMark={mark} defaultOpen={defaultOpen}>
      {items.map((m) => (
        <div key={m.id}>
          <ChecklistRow
            m={m} editable={editable}
            onToggle={onToggleMilestone} onDate={onChangeMilestoneDate}
          />
          {groupAfter[m.label] && (
            <FillLines
              lines={docLines.filter((d) => d.group_key === groupAfter[m.label])}
              editable={editable}
              onToggle={onToggleDocLine} onChange={onChangeDocLine}
            />
          )}
        </div>
      ))}
    </Section>
  )
}

function ChecklistRow({ m, editable, onToggle, onDate }: {
  m: Milestone; editable: boolean
  onToggle?: (m: Milestone) => void
  onDate?: (m: Milestone, v: string | null) => void
}) {
  const row = (
    <>
      <div className="box">✓</div>
      <div className="txt">{m.label}</div>
      {editable && m.has_date ? (
        <input
          className="dateinput" type="date" value={m.date_value ?? ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onDate?.(m, e.target.value || null)}
        />
      ) : m.has_date ? (
        <div className={`date${m.date_value ? '' : ' empty'}`}>
          {m.date_value ? fmtShort(m.date_value) : '— —'}
        </div>
      ) : (
        <div className="date">{m.is_complete && m.date_value ? fmtShort(m.date_value) : ''}</div>
      )}
    </>
  )

  if (!editable) {
    return <div className={`chk${m.is_complete ? ' done' : ''}`}>{row}</div>
  }
  return (
    <button
      type="button"
      className={`chk editable${m.is_complete ? ' done' : ''}`}
      onClick={() => onToggle?.(m)}
      aria-pressed={m.is_complete}
    >
      {row}
    </button>
  )
}

function FillLines({ lines, editable, onToggle, onChange }: {
  lines: SharedPayload['doc_lines']; editable: boolean
  onToggle?: (id: string, checked: boolean) => void
  onChange?: (id: string, text: string) => void
}) {
  // Clients see only the lines that have something written on them; blank
  // placeholder rows are noise on a phone.
  const visible = editable ? lines : lines.filter((l) => l.text.trim() !== '')
  if (visible.length === 0) return null

  return (
    <>
      {visible.sort((a, b) => a.sort_order - b.sort_order).map((l) => (
        <div className="fill" key={l.id}>
          {editable ? (
            <>
              <button type="button" className={`tick${l.is_checked ? '' : ' off'}`}
                      onClick={() => onToggle?.(l.id, !l.is_checked)}>✔</button>
              <input className="line" value={l.text} placeholder="…"
                     onChange={(e) => onChange?.(l.id, e.target.value)} />
            </>
          ) : (
            <>
              <span className={`tick${l.is_checked ? '' : ' off'}`}>✔</span>
              <span className="line">{l.text}</span>
            </>
          )}
        </div>
      ))}
    </>
  )
}

/**
 * A dated log, one per side. Entries are never edited or deleted once posted —
 * that's what makes it a history instead of a note that can quietly change.
 * Clients see it read-only; only the admin view can post.
 */
function NotesBoard({ title, side, notes, lending, editable, onAdd }: {
  title: string; side: Side; notes: Note[]; lending?: boolean
  editable?: boolean; onAdd?: (side: Side, body: string) => void
}) {
  const [draft, setDraft] = useState('')
  const items = notes.filter((n) => n.side === side)
  if (items.length === 0 && !editable) return null

  function post() {
    const body = draft.trim()
    if (!body) return
    onAdd?.(side, body)
    setDraft('')
  }

  return (
    <div className={`card notesboard${lending ? ' lending' : ''}`}>
      <h3 className="eyebrow">{title}</h3>

      {items.length === 0 ? (
        <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
          No updates posted yet.
        </p>
      ) : (
        <div className="notelist">
          {items.map((n) => (
            <div className="note" key={n.id}>
              <div className="notemeta">
                {n.author_name && <span className="noteauthor">{n.author_name}</span>}
                <span className="notewhen">{fmtNoteWhen(n.created_at)}</span>
              </div>
              <p className="notebody">{n.body}</p>
            </div>
          ))}
        </div>
      )}

      {editable && (
        <div className="noteadd">
          <textarea
            rows={2} value={draft} placeholder="Post an update…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post()
            }}
          />
          <button type="button" className="btn" onClick={post} disabled={!draft.trim()}>
            Post
          </button>
        </div>
      )}
    </div>
  )
}

function fmtNoteWhen(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function ContactsSection({
  contacts, editable, savedContacts, onPatch, onPickSaved, onSaveContact, onUploadContactPhoto,
}: {
  contacts: Contact[]; editable?: boolean; savedContacts?: SavedContact[]
  onPatch?: (id: string, v: Partial<Contact>) => void
  onPickSaved?: (contactId: string, savedId: string) => void
  onSaveContact?: (contact: Contact) => void
  onUploadContactPhoto?: (contactId: string, file: File) => void
}) {
  const by = (g: string) => contacts.filter((c) => c.group_key === g)
    .sort((a, b) => a.sort_order - b.sort_order)
  const people = by('people')
  const utils = by('utilities')

  // Clients don't need to scroll past a dozen "not set" rows on a phone.
  const shown = (rows: Contact[]) => editable ? rows : rows.filter((c) => c.name?.trim())
  const filled = contacts.filter((c) => c.name?.trim()).length

  const savedFor = (c: Contact) =>
    savedContacts?.filter((s) => s.group_key === c.group_key && s.role_label === c.role_label) ?? []

  return (
    <Section title="Contacts" count={editable ? `${filled} / ${contacts.length}` : String(filled)}
             defaultOpen>
      {shown(people).map((c) => (
        <ContactRow key={c.id} c={c} editable={editable} onPatch={onPatch}
                    saved={savedFor(c)} onPickSaved={onPickSaved} onSaveContact={onSaveContact}
                    onUploadContactPhoto={onUploadContactPhoto} />
      ))}
      {shown(utils).length > 0 && <div className="glabel">Utility Companies</div>}
      {shown(utils).map((c) => (
        <ContactRow key={c.id} c={c} editable={editable} onPatch={onPatch}
                    saved={savedFor(c)} onPickSaved={onPickSaved} onSaveContact={onSaveContact}
                    onUploadContactPhoto={onUploadContactPhoto} />
      ))}
    </Section>
  )
}

const FIXED_INTERNAL_ROLES = [
  'Buyer Transaction Coordinator', 'Seller Transaction Coordinator', 'Title Closer', 'Title Processor',
]

/**
 * Agent-only contacts — buyer/seller TC, title closer/processor, plus any
 * free-typed extras. Only ever rendered on the admin side (gated in
 * Dashboard on editable && internalContacts being passed at all) — the
 * client link never sees this, since get_shared_transaction() excludes
 * internal_only rows entirely.
 */
function AgentOnlyContactsSection({ contacts, onPatch, onAdd, onRemove, onUploadContactPhoto }: {
  contacts: Contact[]
  onPatch?: (id: string, v: Partial<Contact>) => void
  onAdd?: () => void
  onRemove?: (id: string) => void
  onUploadContactPhoto?: (contactId: string, file: File) => void
}) {
  const sorted = [...contacts].sort((a, b) => a.sort_order - b.sort_order)
  const fixed = sorted.filter((c) => FIXED_INTERNAL_ROLES.includes(c.role_label))
  const extra = sorted.filter((c) => !FIXED_INTERNAL_ROLES.includes(c.role_label))

  return (
    <Section title="Agent Only Contacts" count={String(contacts.length)}>
      <p className="sethelp" style={{ margin: '0 0 8px' }}>
        Not visible to the client — transaction coordinators, title team, anything you need
        on file but don't want on their page.
      </p>
      {fixed.map((c) => (
        <ContactRow key={c.id} c={c} editable onPatch={onPatch}
                    onUploadContactPhoto={onUploadContactPhoto} />
      ))}
      {extra.length > 0 && <div className="glabel">Additional</div>}
      {extra.map((c) => (
        <ContactRow key={c.id} c={c} editable onPatch={onPatch}
                    onUploadContactPhoto={onUploadContactPhoto}
                    labelEditable onRemove={onRemove ? () => onRemove(c.id) : undefined} />
      ))}
      <div className="savebar"><button type="button" className="btn" onClick={onAdd}>+ Add contact</button></div>
    </Section>
  )
}

function ContactRow({
  c, editable, onPatch, saved, onPickSaved, onSaveContact, onUploadContactPhoto,
  labelEditable, onRemove,
}: {
  c: Contact; editable?: boolean; onPatch?: (id: string, v: Partial<Contact>) => void
  saved?: SavedContact[]
  onPickSaved?: (contactId: string, savedId: string) => void
  onSaveContact?: (contact: Contact) => void
  onUploadContactPhoto?: (contactId: string, file: File) => void
  /** Free-typed "additional" rows get an editable role and a delete button;
   *  the fixed roles (Buyer TC, Title Closer, etc.) don't. */
  labelEditable?: boolean
  onRemove?: () => void
}) {
  const [open, setOpen] = useState(false)

  if (!editable) {
    return (
      <div className="crow">
        <span className="k" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {c.photo_url && <img src={c.photo_url} alt="" style={{
            width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flex: 'none',
            border: '1px solid var(--line)',
          }} />}
          {c.role_label}
        </span>
        <div className="rt">
          <div>
            <span className="v">{c.name}</span>
            {c.note && <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 1 }}>{c.note}</div>}
          </div>
          {c.phone && <a className="tapicon" href={telHref(c.phone)}
                         aria-label={`Call ${c.role_label}`}>✆</a>}
          {c.email && <a className="tapicon" href={`mailto:${c.email}`}
                         aria-label={`Email ${c.role_label}`}>✉</a>}
        </div>
      </div>
    )
  }

  return (
    <div className="crowEdit">
      <div className="crow">
        {labelEditable ? (
          <EditableText className="k" value={c.role_label} placeholder="Contact type"
                        onCommit={(v) => onPatch?.(c.id, { role_label: v || 'Contact' })} />
        ) : (
          <span className="k">{c.role_label}</span>
        )}
        <div className="rt">
          <EditableText className="v" value={c.name ?? ''} placeholder="not set"
                        onCommit={(v) => onPatch?.(c.id, { name: v || null })} />
          <button type="button" className={`tapicon${open ? ' on' : ''}`}
                  onClick={() => setOpen((o) => !o)}
                  title="Phone and email">⋯</button>
          {onRemove && (
            <button type="button" className="tapicon" onClick={onRemove} title="Remove">✕</button>
          )}
        </div>
      </div>
      {open && (
        <div className="crowMore">
          {!!saved?.length && (
            <select
              value=""
              style={{ fontSize: 11.5 }}
              onChange={(e) => { if (e.target.value) onPickSaved?.(c.id, e.target.value) }}
            >
              <option value="">Use a saved {c.role_label}…</option>
              {saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <EditableText value={c.phone ?? ''} placeholder="Phone"
                        onCommit={(v) => onPatch?.(c.id, { phone: v || null })} />
          <EditableText value={c.email ?? ''} placeholder="Email"
                        onCommit={(v) => onPatch?.(c.id, { email: v || null })} />
          <EditableText value={c.note ?? ''} placeholder="Address (optional)"
                        onCommit={(v) => onPatch?.(c.id, { note: v || null })} />
          <label className="btn" style={{ fontSize: 11, alignSelf: 'flex-start', cursor: 'pointer' }}>
            <input type="file" accept="image/*" style={{ display: 'none' }}
                   onChange={(e) => {
                     const f = e.target.files?.[0]
                     if (f) onUploadContactPhoto?.(c.id, f)
                   }} />
            {c.photo_url ? 'Change photo/logo' : 'Add a photo/logo'}
          </label>
          {c.name?.trim() && (
            <button type="button" className="btn" style={{ fontSize: 11, alignSelf: 'flex-start' }}
                    onClick={() => onSaveContact?.(c)}>
              Save "{c.name}" for next time
            </button>
          )}
        </div>
      )}
    </div>
  )
}
