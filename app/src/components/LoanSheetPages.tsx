/**
 * The three letter-size pages of the Loan Options Worksheet, exactly as the
 * client receives them in the PDF. Fixed 816×1056 px (8.5×11 in at 96 dpi) so
 * the on-screen preview and the PDF are the same picture.
 *
 * Branding is The Surek Group, plus The Mattheis Team logo on that team's
 * version — never a brokerage logo, per Allison. The lending disclosures below are the wording she approved for
 * the printed worksheet (Sept 2026).
 */
import type { ReactNode } from 'react'
import shore from '../assets/loan-sheet/shore.jpg'
import mattheisLogo from '../assets/loan-sheet/mattheis-team.png'
import surekLogo from '../assets/loan-sheet/surek-group.png'
import applyQr from '../assets/loan-sheet/apply-qr.svg'
import surekSiteQr from '../assets/loan-sheet/surek-site-qr.svg'
import {
  type LoanOfficerProfile, type OptionCalc, type RateSheet, type WorksheetClient, COMPANY_NMLS,
  fmtLongDate, money, pct3,
} from '../lib/loanWorksheet'


function Eho() {
  return (
    <svg className="s-eho" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M9 13h6M9 16h6" />
    </svg>
  )
}

function Ph({ v, label }: { v: string | null | undefined; label: string }) {
  return v ? <>{v}</> : <span className="s-ph">[{label}]</span>
}

function Legal({ n, lo }: { n: number; lo: LoanOfficerProfile }) {
  return (
    <div className="s-legal">
      <span>
        {lo.fullName}, {lo.title}, NMLS #{lo.nmls} · The Surek Group, a DBA of US Lending Group
        Corporation, NMLS #{COMPANY_NMLS} · <Eho />Equal Housing Opportunity
      </span>
      <span>{String(n).padStart(2, '0')}</span>
    </div>
  )
}

function RunHead({ section }: { section: string }) {
  return <div className="s-rh"><span>Your Loan Options · The Surek Group</span><span>{section}</span></div>
}

const STEPS: [string, string, string][] = [
  ['01', 'Apply online', 'Takes about 15 minutes; the secure link is on page 3.'],
  ['02', 'Review together', 'We walk through your options and fine-tune these numbers.'],
  ['03', 'Get pre-approved', 'Your agent gets a strong pre-approval letter to shop with.'],
  ['04', 'Lock & close', 'Rate lock, appraisal and underwriting, with updates at every step.'],
]
const DOCS = [
  'Last 30 days of pay stubs', 'W-2s (or 1099s) for the past 2 years',
  'Federal tax returns for the past 2 years, if self-employed',
  'Last 2 months of bank and asset statements, all pages', 'Photo ID for everyone on the loan',
  'VA Certificate of Eligibility, if applicable', 'Gift letter and donor statement, if family is helping',
  'Current lease or mortgage statement',
]

export default function LoanSheetPages({ sheet, client, options, selected, lo }: {
  lo: LoanOfficerProfile
  sheet: RateSheet
  client: WorksheetClient
  options: OptionCalc[]
  selected: string[]
}) {
  const name = client.name.trim()
  const price = client.price
  const downTxt = client.downPct != null && price
    ? `${money(price * client.downPct / 100)} / ${client.downPct}%`
    : client.downPct != null ? `${client.downPct}%` : ''
  const fields: [string, ReactNode][] = [
    ['Prepared for', <Ph v={name} label="Client name" />],
    ['Date', <Ph v={fmtLongDate(client.date)} label="Date" />],
    ['Referred by', <Ph v={client.agent} label="Agent name" />],
    ['Target price', price ? money(price) : <Ph v="" label="Price" />],
    ['Down payment', <Ph v={downTxt} label="Down payment" />],
    ['Credit range', <Ph v={client.credit} label="Credit range" />],
    ['Property type', client.propertyType],
    ['Occupancy', client.occupancy],
    ['Timeline', <Ph v={client.timeline} label="Timeline" />],
  ]
  const assume = (sheet.assumptions || '').replace('[DATE]', sheet.as_of ? fmtLongDate(sheet.as_of) : '[DATE]')
  const sel = new Set(selected)
  const feeNote = options.some((o) => o.program.fee)
    ? ' Loan amounts include any upfront fee financed into the loan (FHA upfront MIP, VA funding fee or USDA guarantee fee).' : ''
  const armNote = options.some((o) => /arm/i.test(o.program.name))
    ? ' Adjustable-rate payments are shown at the initial rate and can rise after the fixed period.' : ''
  const row = (label: string, f: (o: OptionCalc) => ReactNode, cls = '') => (
    <tr className={cls}><td>{label}</td>{options.map((o) => <td key={o.program.id}>{f(o)}</td>)}</tr>
  )

  return (
    <>
      {/* ---------- page 1: welcome ---------- */}
      <div className="sp">
        <div className="s-abs" style={{ left: 0, top: 0, right: 0, height: 322, background: `url(${shore}) center 60%/cover no-repeat` }} />
        <div className="s-abs" style={{ left: 0, top: 0, right: 0, height: 322, background: 'linear-gradient(to right, rgba(10,25,45,.62) 0%, rgba(10,25,45,.25) 45%, rgba(10,25,45,0) 70%)' }} />
        <div className="s-abs" style={{ left: 0, right: 0, top: 322, height: 2, background: '#B39A5E' }} />
        <div className="s-abs s-hero">
          <div className="s-heroeyebrow">A personalized loan snapshot</div>
          <div className="s-herotitle">Your loan</div>
          <div className="s-herotitle" style={{ color: '#F1E2B8' }}>options</div>
          <div className="s-herorule" />
        </div>
        <div className="s-abs" style={{ left: 72, top: 362, width: 390 }}>
          <div className="s-kick">Welcome</div>
          <div className="s-corm" style={{ fontSize: 26, lineHeight: 1.2, marginBottom: 12 }}>Hi <Ph v={name} label="Client name" />,</div>
          <p className="s-letter">{sheet.intro_1}</p>
          <p className="s-letter" style={{ marginBottom: 8 }}>{sheet.intro_2}</p>
          <div className="s-corm" style={{ fontSize: 30, color: '#B39A5E', lineHeight: 1 }}>{lo.signName}</div>
          <div className="s-sig">{lo.title} · NMLS #{lo.nmls}</div>
          <div className="s-lbl" style={{ margin: '24px 0 5px' }}>What you can count on</div>
          <div className="s-chk"><i /><span>Fast, thorough pre-approvals your agent can rely on</span></div>
          <div className="s-chk"><i /><span>Clear updates for you and your agent at every step</span></div>
          <div className="s-chk"><i /><span>Programs for first-time buyers, veterans and investors</span></div>
        </div>
        <div className="s-abs" style={{ left: 496, right: 56, top: 362 }}>
          <div className="s-fill" style={{ padding: '13px 15px 8px' }}>
            <div className="s-lbl" style={{ marginBottom: 2 }}>Your snapshot</div>
            {fields.map(([k, v]) => (
              <div className="s-fieldrow" key={k}><span className="s-k">{k}</span><span className="s-v">{v}</span></div>
            ))}
          </div>
        </div>
        <div className="s-abs s-logos">
          {lo.showMattheisLogo ? (
            <>
              <img src={mattheisLogo} style={{ width: 230 }} alt="The Mattheis Team" />
              <span className="s-vrule" />
              <img src={surekLogo} style={{ height: 76 }} alt="The Surek Group" />
            </>
          ) : (
            <>
              <div className="s-lotext">
                <div className="s-corm" style={{ fontSize: 26, lineHeight: 1.1 }}>{lo.fullName}</div>
                <div className="s-sig" style={{ marginTop: 6 }}>{lo.title} · NMLS #{lo.nmls}</div>
                <div className="s-locontact">{lo.phone}<br />{lo.email}</div>
              </div>
              <span className="s-vrule" />
              <img src={surekLogo} style={{ height: 76 }} alt="The Surek Group" />
            </>
          )}
        </div>
        <Legal n={1} lo={lo} />
      </div>

      {/* ---------- page 2: rates at a glance + next steps ---------- */}
      <div className="sp">
        <div className="s-pad">
          <RunHead section="Loan Options" />
          <div className="s-kick">Today's market</div>
          <h3>Loan options <em>at a glance</em></h3>
          <table>
            <thead><tr><th style={{ width: '30%' }}>Loan program</th><th>Rate</th><th>APR</th><th>Min. down</th><th style={{ width: '30%' }}>Best for</th></tr></thead>
            <tbody>
              {sheet.programs.map((p) => (
                <tr key={p.id} className={sel.has(p.id) ? 's-hl' : ''}>
                  <td>{p.name}</td><td>{pct3(p.rate)}</td><td>{pct3(p.apr)}</td><td>{p.minDown}</td>
                  <td style={{ fontSize: 11 }}>{p.best}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="s-snote">{assume}{selected.length ? ' Highlighted rows are the options compared on page 3.' : ''}</div>

          <div className="s-kick" style={{ marginTop: 24 }}>Getting ready</div>
          <h3>Your <em>next steps</em></h3>
          <div className="s-twocol">
            <div>
              <div className="s-lbl" style={{ margin: '4px 0 8px' }}>How it works</div>
              {STEPS.map(([n, t, d]) => (
                <div className="s-step" key={n}>
                  <span className="s-corm s-stepnum">{n}</span>
                  <span className="s-steptxt"><b>{t}</b><br />{d}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="s-lbl" style={{ margin: '4px 0 8px' }}>What I'll need from you</div>
              {DOCS.map((d) => <div className="s-chk" key={d}><i /><span>{d}</span></div>)}
            </div>
          </div>
        </div>
        <Legal n={2} lo={lo} />
      </div>

      {/* ---------- page 3: side-by-side ---------- */}
      <div className="sp">
        <div className="s-pad">
          <RunHead section="Your Numbers" />
          <div className="s-kick">Built for <Ph v={name} label="Client name" /></div>
          <h3>Side-by-side <em>costs</em></h3>
          {options.length ? (
            <table>
              <thead><tr><th style={{ width: '30%' }} />{options.map((o, i) => <th key={o.program.id}>Option {i + 1}</th>)}</tr></thead>
              <tbody>
                {row('Loan program', (o) => <b>{o.program.name}</b>)}
                {row('Purchase price', () => money(price))}
                {row('Down payment', (o) => `${money(o.down)} (${+o.downPct.toFixed(2)}%)`)}
                {row('Loan amount', (o) => money(o.loan))}
                {row('Rate / APR', (o) => `${pct3(o.program.rate)} / ${pct3(o.program.apr)}`)}
                <tr className="s-sub"><td colSpan={options.length + 1}>Estimated monthly payment</td></tr>
                {row('Principal & interest', (o) => money(o.pi))}
                {row('Property taxes', (o) => money(o.tax))}
                {row('Homeowners insurance', (o) => money(o.ins))}
                {row('Mortgage insurance', (o) => money(o.mi))}
                {row('HOA / CDD', (o) => money(o.hoa))}
                {row('Total monthly payment', (o) => money(o.total), 's-tot')}
              </tbody>
            </table>
          ) : (
            <div className="s-fill" style={{ textAlign: 'center', color: '#8a8a8a', padding: 40 }}>Pick up to three loans to compare.</div>
          )}
          <div className="s-snote">
            Estimates only, based on the information provided so far. Your official Loan Estimate will show final terms
            and costs. Taxes, insurance and HOA/CDD amounts vary by property.{feeNote}{armNote}
          </div>
          <div className="s-fill" style={{ marginTop: 18, minHeight: 118 }}>
            <div className="s-lbl" style={{ marginBottom: 6 }}>Notes for <Ph v={name} label="Client name" /></div>
            <div className="s-notes">
              {client.notes || <span className="s-ph">Programs to watch, down payment assistance, credit tips, seller credit strategy, timing.</span>}
            </div>
          </div>
          <div className="s-cta">
            <img src={lo.qr === 'lendingpad' ? applyQr : surekSiteQr} style={{ width: 92, height: 92, flex: 'none' }} alt="Scan to apply" />
            <div style={{ flex: 1 }}>
              <div className="s-corm" style={{ fontSize: 22, lineHeight: 1.1, marginBottom: 5 }}>Ready when you are</div>
              <p className="s-ctatxt">{lo.ctaText}</p>
              <div className="s-ctacontact">{lo.phone} &nbsp;·&nbsp; <span style={{ textTransform: 'none', letterSpacing: '.02em' }}>{lo.email}</span></div>
            </div>
            <div style={{ borderLeft: '1px solid #E6DFCF', paddingLeft: 18 }}><img src={surekLogo} style={{ height: 64 }} alt="The Surek Group" /></div>
          </div>
          <div className="s-disc">
            {lo.fullName}, {lo.title}, NMLS #{lo.nmls}. The Surek Group is a registered trademark and DBA of
            US Lending Group Corporation, NMLS #{COMPANY_NMLS}. www.nmlsconsumeraccess.org<br />
            <Eho />Equal Housing Opportunity. This is not a commitment to lend. All loans are subject to credit approval and
            program guidelines. Rates, terms and costs shown are estimates and could change.
          </div>
        </div>
        <Legal n={3} lo={lo} />
      </div>
    </>
  )
}
