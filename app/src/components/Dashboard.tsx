import { useEffect, useState, type ReactNode } from 'react'
import type {
  SharedPayload, Milestone, Side, Brand, DocGroup, Contact,
} from '../lib/types'
import { STATUS_LABEL } from '../lib/types'
import './Dashboard.css'

/* ------------------------------------------------------------------ helpers */

export function useIsDesktop(breakpoint = 900) {
  const [is, setIs] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= breakpoint,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`)
    const on = () => setIs(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [breakpoint])
  return is
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
}

interface Props extends DashboardHandlers {
  data: SharedPayload
  editable?: boolean
  /** Right-hand note in the brand bar. */
  viewNote?: string
  headerExtra?: ReactNode
}

/* ------------------------------------------------------------------ main */

export default function Dashboard({
  data, editable = false, viewNote = 'Transaction Portal · Client View',
  headerExtra, ...h
}: Props) {
  const isDesktop = useIsDesktop()
  const { transaction: tx, realtor, brands, milestones, doc_lines, contacts } = data

  const reBrand = brands.real_estate
  const lendBrand = brands.lending
  const hasLoan = tx.deal_type === 'buy' && milestones.some((m) => m.side === 'loan')

  // Brand colors drive the CSS variables, so a color change in Settings
  // repaints the whole page with no code change.
  const styleVars: React.CSSProperties & Record<string, string> = {} as never
  if (reBrand?.accent_hex) styleVars['--gold'] = reBrand.accent_hex
  if (lendBrand?.accent_hex) styleVars['--lend'] = lendBrand.accent_hex

  const railSteps = milestones
    .filter((m) => m.side === 'real_estate' && m.is_rail_step)
    .sort((a, b) => a.sort_order - b.sort_order)
  const firstOpen = railSteps.findIndex((s) => !s.is_complete)
  const currentIdx = firstOpen === -1 ? railSteps.length : firstOpen

  return (
    <div className="dash" style={styleVars}>
      <BrandBar brand={reBrand} viewNote={viewNote} extra={headerExtra} />

      {isDesktop ? (
        <div className="topgrid">
          <Hero tx={tx} showText={false} />
          <div className="headline">
            <h1 className="address">{tx.address_line || 'Untitled property'}</h1>
            <div className="cityline">{tx.city_state_zip}</div>
            <div className="statusrow"><StatusPill tx={tx} /></div>
          </div>
          <TeamCards realtor={realtor} lender={tx.lender} />
        </div>
      ) : (
        <>
          <Hero tx={tx} showText />
          <div className="statusrow"><StatusPill tx={tx} /></div>
          {tx.closing_date && <Countdown date={tx.closing_date} inline />}
          <TeamCards realtor={realtor} lender={tx.lender} />
        </>
      )}

      {railSteps.length > 0 && (
        <Rail steps={railSteps} currentIdx={currentIdx} isDesktop={isDesktop} />
      )}

      <div className={`sections${hasLoan ? '' : ' twocol'}`}>
        <div className="col">
          <ChecklistSection
            title="Real Estate" side="real_estate" milestones={milestones}
            docLines={[]} editable={editable} isDesktop={isDesktop}
            defaultOpen {...h}
          />
        </div>

        <div className="col">
          {isDesktop && tx.closing_date && <Countdown date={tx.closing_date} />}
          <ContactsSection contacts={contacts} isDesktop={isDesktop} />
        </div>

        {hasLoan && (
          <div className="col">
            <ChecklistSection
              title="Loan" side="loan" milestones={milestones}
              docLines={doc_lines} lending brand={lendBrand}
              editable={editable} isDesktop={isDesktop} {...h}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ pieces */

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

function Hero({ tx, showText }: { tx: SharedPayload['transaction']; showText: boolean }) {
  if (!tx.photo_url) {
    return (
      <div className="hero noPhoto">
        {showText && (
          <div className="heroText">
            <h1 className="address">{tx.address_line || 'Untitled property'}</h1>
            <div className="cityline">{tx.city_state_zip}</div>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="hero">
      <img src={tx.photo_url} alt={tx.address_line} />
      {showText && (
        <div className="heroText">
          <h1 className="address">{tx.address_line || 'Untitled property'}</h1>
          <div className="cityline">{tx.city_state_zip}</div>
        </div>
      )}
    </div>
  )
}

function StatusPill({ tx }: { tx: SharedPayload['transaction'] }) {
  const attention = tx.status === 'attention' || tx.status === 'fell_through'
  return (
    <span className={`pill${attention ? ' attention' : ''}`}>
      <span className="dot">{attention ? '!' : '✓'}</span>
      {tx.status_note || STATUS_LABEL[tx.status]}
    </span>
  )
}

function Countdown({ date, inline }: { date: string; inline?: boolean }) {
  const days = daysUntil(date)
  const past = days < 0
  const label = past ? 'Closed' : days === 0 ? 'Today' : days === 1 ? 'day away' : 'days away'

  return (
    <div className="countdown">
      <div className="num">{past ? '✓' : days}</div>
      <div className="rt">
        <div className="lab">Closing day</div>
        <div className="unit">{past ? 'Closed' : label}</div>
        <div className="when">{fmtLong(date)}</div>
      </div>
      {!inline && null}
    </div>
  )
}

function TeamCards({ realtor, lender }: {
  realtor: SharedPayload['realtor']; lender: SharedPayload['transaction']['lender']
}) {
  const hasLender = Boolean(lender?.name)
  if (!realtor && !hasLender) return null
  return (
    <div className="team">
      {realtor && (
        <div className="person">
          <Avatar src={realtor.headshot_url} name={realtor.full_name} />
          <div className="who">
            <div className="role">Realtor</div>
            <div className="name">{realtor.full_name}</div>
            {realtor.license_number && <div className="lic">{realtor.license_number}</div>}
          </div>
        </div>
      )}
      {hasLender && (
        <div className="person lend">
          <Avatar src={lender.headshot_url} name={lender.name || ''} />
          <div className="who">
            <div className="role">Loan Officer</div>
            <div className="name">{lender.name}</div>
            {lender.license && <div className="lic">{lender.license}</div>}
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

function Rail({ steps, currentIdx, isDesktop }: {
  steps: Milestone[]; currentIdx: number; isDesktop: boolean
}) {
  const pct = steps.length < 2 ? 0 : (currentIdx / (steps.length - 1)) * 100

  if (isDesktop) {
    return (
      <div className="rail card">
        <div className="hsteps">
          <div className="track"><div className="fill2" style={{ width: `${pct}%` }} /></div>
          {steps.map((s, i) => (
            <div key={s.id} className={`hstep${s.is_complete ? ' done' : i === currentIdx ? ' current' : ''}`}>
              <div className="node">{s.is_complete ? '✓' : i + 1}</div>
              <div className="lbl">{s.rail_label || s.label}</div>
              <div className="dt">{fmtShort(s.date_value)}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rail card">
      <h3 className="eyebrow">Where we are</h3>
      <div className="vsteps">
        {steps.map((s, i) => (
          <div key={s.id} className={`vstep${s.is_complete ? ' done' : i === currentIdx ? ' current' : ''}`}>
            <div className="spine" />
            <div className="node">{s.is_complete ? '✓' : i + 1}</div>
            <div>
              <div className="lbl">{s.rail_label || s.label}</div>
              {s.date_value && <div className="dt">{fmtShort(s.date_value)}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Collapsible on phone, always-open panel on desktop. */
function Section({ title, brandMark, count, lending, defaultOpen, isDesktop, children }: {
  title: string; brandMark?: ReactNode; count?: string; lending?: boolean
  defaultOpen?: boolean; isDesktop: boolean; children: ReactNode
}) {
  const head = (
    <>
      <div className="sechead">
        <span className="sectitle">{title}</span>
        {brandMark && <span className="lendmark">{brandMark}</span>}
      </div>
      <div className="secright">
        {count && <span className="count">{count}</span>}
        {!isDesktop && <span className="chev">▼</span>}
      </div>
    </>
  )

  if (isDesktop) {
    return (
      <div className={`sec card${lending ? ' lending' : ''}`}>
        <div className="sechdr">{head}</div>
        <div className="secbody">{children}</div>
      </div>
    )
  }
  return (
    <details className={`sec card${lending ? ' lending' : ''}`} open={defaultOpen}>
      <summary>{head}</summary>
      <div className="secbody">{children}</div>
    </details>
  )
}

function ChecklistSection({
  title, side, milestones, docLines, lending, brand, editable, isDesktop, defaultOpen,
  onToggleMilestone, onChangeMilestoneDate, onToggleDocLine, onChangeDocLine,
}: {
  title: string; side: Side; milestones: Milestone[]; docLines: SharedPayload['doc_lines']
  lending?: boolean; brand?: Brand; editable: boolean; isDesktop: boolean; defaultOpen?: boolean
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
               defaultOpen={defaultOpen} isDesktop={isDesktop}>
        <div className="emptynote">
          No checklist yet for this type of transaction.<br />
          Add the steps in <strong>Settings › Checklists</strong>.
        </div>
      </Section>
    )
  }

  return (
    <Section title={title} count={`${done} / ${items.length}`} lending={lending}
             brandMark={mark} defaultOpen={defaultOpen} isDesktop={isDesktop}>
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

function ContactsSection({ contacts, isDesktop }: { contacts: Contact[]; isDesktop: boolean }) {
  const people = contacts.filter((c) => c.group_key === 'people').sort((a, b) => a.sort_order - b.sort_order)
  const utils = contacts.filter((c) => c.group_key === 'utilities').sort((a, b) => a.sort_order - b.sort_order)

  return (
    <Section title="Contacts" count={String(contacts.length)} isDesktop={isDesktop}>
      {people.map((c) => <ContactRow key={c.id} c={c} />)}
      {utils.length > 0 && <div className="glabel">Utility Companies</div>}
      {utils.map((c) => <ContactRow key={c.id} c={c} />)}
    </Section>
  )
}

function ContactRow({ c }: { c: Contact }) {
  return (
    <div className="crow">
      <span className="k">{c.role_label}</span>
      <div className="rt">
        <span className={`v${c.name ? '' : ' blank'}`}>{c.name || 'not set'}</span>
        {c.phone && <a className="tapicon" href={telHref(c.phone)} aria-label={`Call ${c.role_label}`}>✆</a>}
        {c.email && <a className="tapicon" href={`mailto:${c.email}`} aria-label={`Email ${c.role_label}`}>✉</a>}
      </div>
    </div>
  )
}
