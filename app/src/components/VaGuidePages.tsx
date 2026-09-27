/**
 * VA Buyer Guide — four letter-size pages, same fixed printed design as the
 * Loan Options Worksheet (LoanSheetPages): 816×1056 px, `s-` classes inside
 * `.sp`, Roboto light + Cormorant italic, The Mattheis Team + The Surek Group
 * branding only.
 *
 * VA facts here are current as of Sept 2026 (funding fee table effective for
 * loans closed on or after April 7, 2023). If VA changes the funding fee or
 * the 4% concession rule, update FUNDING_FEE / the closing-cost rows.
 * The closing disclosure paragraph on page 4 reuses the wording Allison
 * approved for the worksheet; don't reword it.
 */
import type { ReactNode } from 'react'
import shore from '../assets/loan-sheet/shore.jpg'
import mattheisLogo from '../assets/loan-sheet/mattheis-team.png'
import surekLogo from '../assets/loan-sheet/surek-group.png'
import applyQr from '../assets/loan-sheet/apply-qr.svg'
import { EMAIL, Eho, Legal, NMLS_CO, NMLS_MLO, PHONE } from './LoanSheetPages'

function RunHead({ section }: { section: string }) {
  return <div className="s-rh"><span>VA Home Loans · The Surek Group</span><span>{section}</span></div>
}

const STATS: [string, string][] = [
  ['$0', 'down payment'],
  ['$0', 'monthly mortgage insurance'],
  ['4%', 'extra seller help allowed'],
  ['No', 'VA loan limit with full entitlement'],
]

const PERKS: [string, ReactNode][] = [
  ['No down payment', 'With full entitlement you can buy with nothing down, and VA has no loan limit, so there is no cap on price as long as you qualify for the payment.'],
  ['No monthly mortgage insurance', 'Conventional loans under 20% down and FHA loans carry monthly mortgage insurance. VA loans never do, which keeps more of your payment working for you.'],
  ['Competitive rates', 'VA rates are often lower than conventional rates for the same buyer, because VA backs part of the loan.'],
  ['Flexible credit', 'VA sets no minimum credit score. Lenders set their own, and VA guidelines look at the whole picture, including residual income.'],
  ['Limits on your costs', 'VA caps what a lender can charge you and bars some fees from being charged to veterans at all.'],
  ['Seller can pay your costs', 'Sellers can pay all of your normal closing costs, plus up to 4% of the price in extra concessions.'],
  ['Reusable benefit', "It isn't one-and-done. Your entitlement can be used again, and restored once a VA loan is paid off."],
  ['Assumable loan', 'When you sell, a qualified buyer may be able to take over your loan and your rate, with lender and VA approval.'],
]

const FUNDING_FEE: [string, string, string][] = [
  ['Less than 5%', '2.15%', '3.30%'],
  ['5% to less than 10%', '1.50%', '1.50%'],
  ['10% or more', '1.25%', '1.25%'],
]

const COSTS: [string, string, string][] = [
  ['Down payment', '$0 with full entitlement. You can still choose to put money down, which lowers your funding fee.', 'You (optional)'],
  ['VA funding fee', 'A one-time fee from the table on page 2. Most buyers roll it into the loan instead of paying it at closing. Waived if you receive VA disability compensation.', 'Financed, or you / seller'],
  ['Lender fees', 'Origination and processing. VA limits these, and some fees can’t be charged to a veteran at all.', 'You, seller or lender credit'],
  ['VA appraisal', 'Ordered through VA to confirm the value and that the home meets VA’s minimum property standards.', 'You or seller'],
  ['Title & settlement', 'Title search, title insurance, closing agent. Varies by county and by what the contract says.', 'You or seller'],
  ['Florida mortgage taxes', 'Documentary stamp tax (0.35%) and intangible tax (0.2%) on the loan amount, plus recording fees.', 'You or seller'],
  ['Prepaids & escrow', 'First year of homeowners insurance, a few months of taxes and insurance to start your escrow account, and interest to the end of the month.', 'You or seller (counts toward the 4%)'],
  ['Inspections', 'Home inspection and a wood-destroying organism (termite) report, usually paid before closing.', 'You, or seller if agreed'],
]

/** Florida homestead exemptions for disabled veterans (Fla. Stat. 196.24,
 *  196.081, 196.082). */
const TAX_BREAKS: [string, string][] = [
  ['10%+ rating', '$5,000 off your home’s assessed value'],
  ['100% P&T rating', 'No property tax on your homestead'],
  ['Age 65+, combat', 'Discount equal to your disability %'],
]

const STEPS: [string, string, string][] = [
  ['01', 'Get your COE', 'Your Certificate of Eligibility proves your benefit. We can usually pull it for you in minutes.'],
  ['02', 'Get pre-approved', 'We review income, credit and assets so your offer is strong from day one.'],
  ['03', 'Find your home', 'We write the offer to ask the seller for help with closing costs where it makes sense.'],
  ['04', 'Appraisal to closing', 'VA appraisal, underwriting and clear to close, with updates at every step.'],
]

const DOCS = [
  'DD-214 (veterans) or statement of service (active duty)',
  'VA award letter, if you receive disability compensation',
  'Last 30 days of pay stubs, or LES for active duty',
  'W-2s for the past 2 years',
  'Last 2 months of bank statements, all pages',
  'Photo ID for everyone on the loan',
]

export default function VaGuidePages({ name }: { name?: string }) {
  const who = name?.trim()
  return (
    <>
      {/* ---------- page 1: welcome + thank you ---------- */}
      <div className="sp">
        <div className="s-abs" style={{ left: 0, top: 0, right: 0, height: 322, background: `url(${shore}) center 60%/cover no-repeat` }} />
        <div className="s-abs" style={{ left: 0, top: 0, right: 0, height: 322, background: 'linear-gradient(to right, rgba(10,25,45,.66) 0%, rgba(10,25,45,.28) 45%, rgba(10,25,45,0) 70%)' }} />
        <div className="s-abs" style={{ left: 0, right: 0, top: 322, height: 2, background: '#B39A5E' }} />
        <div className="s-abs s-hero">
          <div className="s-heroeyebrow">A buyer's guide for those who served</div>
          <div className="s-herotitle">VA home</div>
          <div className="s-herotitle" style={{ color: '#F1E2B8' }}>loans</div>
          <div className="s-herorule" />
        </div>

        <div className="s-abs" style={{ left: 72, top: 360, width: 372 }}>
          <div className="s-kick">Thank you for your service</div>
          <div className="s-corm" style={{ fontSize: 26, lineHeight: 1.2, marginBottom: 12 }}>
            {who ? <>Hi {who},</> : <>Welcome home,</>}
          </div>
          <p className="s-letter">
            You earned one of the strongest home loan benefits available, and we want you to get every bit of it.
            This guide walks through what a VA loan does for you, and what your costs look like when it's time to close.
          </p>
          <p className="s-letter" style={{ marginBottom: 8 }}>
            When you're ready, I'll pull your eligibility, get you pre-approved, and make sure your offer is written to
            put your benefit to work.
          </p>
          <div className="s-corm" style={{ fontSize: 30, color: '#B39A5E', lineHeight: 1 }}>Allison</div>
          <div className="s-sig">Mortgage Loan Officer · NMLS #{NMLS_MLO}</div>
        </div>

        <div className="s-abs" style={{ left: 478, right: 56, top: 360 }}>
          <div className="s-honor">
            <div className="s-lbl" style={{ marginBottom: 8 }}>From our team</div>
            <div className="s-corm" style={{ fontSize: 21, lineHeight: 1.25, marginBottom: 10 }}>
              Served by someone who served
            </div>
            <p>
              Rich Surek, owner of The Surek Group, is a veteran himself. Helping the men and women who have sacrificed
              for all of us, and their families, find their way home is personal to him and to our whole team.
            </p>
            <p style={{ margin: 0 }}>It's work we take a great deal of pride in.</p>
          </div>
        </div>

        <div className="s-abs s-stats" style={{ left: 72, right: 72, top: 690 }}>
          {STATS.map(([big, small]) => (
            <div key={small}><span className="s-corm">{big}</span><span>{small}</span></div>
          ))}
        </div>

        <div className="s-abs s-logos">
          <img src={mattheisLogo} style={{ width: 230 }} alt="The Mattheis Team" />
          <span className="s-vrule" />
          <img src={surekLogo} style={{ height: 76 }} alt="The Surek Group" />
        </div>
        <Legal n={1} />
      </div>

      {/* ---------- page 2: the perks ---------- */}
      <div className="sp">
        <div className="s-pad">
          <RunHead section="Your Benefits" />
          <div className="s-kick">What you've earned</div>
          <h3>The VA <em>advantage</em></h3>
          <div className="s-perks">
            {PERKS.map(([t, d]) => (
              <div className="s-perk" key={t}>
                <i />
                <div><b>{t}</b><span>{d}</span></div>
              </div>
            ))}
          </div>

          <div className="s-kick" style={{ marginTop: 22 }}>The one VA-specific cost</div>
          <h3>The funding <em>fee</em></h3>
          <div className="s-twocol" style={{ gridTemplateColumns: '1.15fr 1fr', alignItems: 'start' }}>
            <table>
              <thead><tr><th>Your down payment</th><th>First use</th><th>After first use</th></tr></thead>
              <tbody>
                {FUNDING_FEE.map(([d, a, b]) => (
                  <tr key={d}><td>{d}</td><td>{a}</td><td>{b}</td></tr>
                ))}
              </tbody>
            </table>
            <div>
              <p className="s-letter" style={{ fontSize: 11.6, marginBottom: 8 }}>
                A one-time fee, as a percent of the loan, that keeps the VA program running. It can be rolled into your
                loan, so it doesn't have to come out of pocket at closing.
              </p>
              <div className="s-lbl" style={{ margin: '6px 0 4px' }}>You pay no funding fee if you</div>
              <div className="s-chk"><i /><span>Receive VA compensation for a service-connected disability</span></div>
              <div className="s-chk"><i /><span>Are a surviving spouse receiving Dependency and Indemnity Compensation</span></div>
              <div className="s-chk"><i /><span>Are an active-duty Purple Heart recipient</span></div>
            </div>
          </div>
          <div className="s-snote">Purchase loans, funding fee rates for loans closed on or after April 7, 2023. Rates are set by VA and can change.</div>

          <div className="s-fill s-taxbox">
            <div className="s-lbl" style={{ marginBottom: 6 }}>Tell us your disability rating early: it can lower your property taxes too</div>
            <div className="s-twocol" style={{ gridTemplateColumns: '1.1fr 1fr', columnGap: 24 }}>
              <div>
                {TAX_BREAKS.map(([k, v]) => (
                  <div className="s-fieldrow" key={k}><span className="s-k" style={{ width: 118 }}>{k}</span><span className="s-v" style={{ fontSize: 11.2 }}>{v}</span></div>
                ))}
              </div>
              <p className="s-steptxt" style={{ margin: 0, fontSize: 11 }}>
                Florida gives these on top of the regular homestead exemption. Property taxes are part of your monthly
                payment, so knowing your rating up front lets us estimate your real payment instead of the seller's tax
                bill, and it can waive your funding fee too. You apply with your county property appraiser after you
                buy, by March 1.
              </p>
            </div>
          </div>
        </div>
        <Legal n={2} />
      </div>

      {/* ---------- page 3: closing costs + next steps ---------- */}
      <div className="sp">
        <div className="s-pad">
          <RunHead section="At Closing" />
          <div className="s-kick">What to expect</div>
          <h3>Your costs <em>at closing</em></h3>
          <table>
            <thead><tr><th style={{ width: '22%' }}>Cost</th><th>What it is</th><th style={{ width: '22%' }}>Who can pay</th></tr></thead>
            <tbody>
              {COSTS.map(([c, d, w]) => (
                <tr key={c}><td>{c}</td><td style={{ fontSize: 10.8, lineHeight: 1.45 }}>{d}</td><td style={{ fontSize: 10.8 }}>{w}</td></tr>
              ))}
            </tbody>
          </table>

          <div className="s-twocol" style={{ marginTop: 14, columnGap: 22 }}>
            <div className="s-fill">
              <div className="s-lbl" style={{ marginBottom: 6 }}>How the seller can help</div>
              <p className="s-steptxt" style={{ margin: 0 }}>
                The seller can pay <b>all of your normal closing costs</b>, and on top of that up to <b>4% of the price</b> in
                concessions, like your funding fee or prepaid taxes and insurance. That's why many VA buyers close with
                little or nothing out of pocket beyond their earnest money deposit, which is credited back to them at closing.
              </p>
            </div>
            <div className="s-fill">
              <div className="s-lbl" style={{ marginBottom: 6 }}>Example: $400,000 home, $0 down</div>
              <div className="s-fieldrow"><span className="s-k">Down payment</span><span className="s-v">$0</span></div>
              <div className="s-fieldrow"><span className="s-k">Funding fee</span><span className="s-v">2.15% = $8,600, rolled in</span></div>
              <div className="s-fieldrow"><span className="s-k">Loan amount</span><span className="s-v">$408,600</span></div>
              <div className="s-fieldrow" style={{ borderBottom: 0 }}><span className="s-k">If exempt</span><span className="s-v">$0 fee · loan $400,000</span></div>
            </div>
          </div>

        </div>
        <Legal n={3} />
      </div>

      {/* ---------- page 4: next steps ---------- */}
      <div className="sp">
        <div className="s-pad">
          <RunHead section="Next Steps" />
          <div className="s-kick">Getting ready</div>
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

          <div className="s-fill" style={{ marginTop: 26, minHeight: 150 }}>
            <div className="s-lbl" style={{ marginBottom: 6 }}>Notes{who ? <> for {who}</> : null}</div>
          </div>
          <div className="s-cta" style={{ marginTop: 22 }}>
            <img src={applyQr} style={{ width: 92, height: 92, flex: 'none' }} alt="Scan to apply" />
            <div style={{ flex: 1 }}>
              <div className="s-corm" style={{ fontSize: 22, lineHeight: 1.1, marginBottom: 5 }}>Ready when you are</div>
              <p className="s-ctatxt">Scan to start your secure application with The Surek Group, or reach me directly.</p>
              <div className="s-ctacontact">{PHONE} &nbsp;·&nbsp; <span style={{ textTransform: 'none', letterSpacing: '.02em' }}>{EMAIL}</span></div>
            </div>
            <div style={{ borderLeft: '1px solid #E6DFCF', paddingLeft: 16 }}><img src={surekLogo} style={{ height: 64 }} alt="The Surek Group" /></div>
          </div>
          <div className="s-disc">
            Allison Mattheis, Mortgage Loan Officer, NMLS #{NMLS_MLO}. The Surek Group is a registered trademark and DBA of
            US Lending Group Corporation, NMLS #{NMLS_CO}. www.nmlsconsumeraccess.org<br />
            <Eho />Equal Housing Opportunity. This is not a commitment to lend. All loans are subject to credit approval and
            program guidelines. Rates, terms and costs shown are estimates and could change.
            VA loans require eligibility; not affiliated with or endorsed by the U.S. Department of Veterans Affairs.
          </div>
        </div>
        <Legal n={4} />
      </div>
    </>
  )
}
