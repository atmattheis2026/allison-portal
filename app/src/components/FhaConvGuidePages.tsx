/**
 * FHA vs Conventional buyer guide — four letter-size pages in the same fixed
 * printed design as the Loan Options Worksheet and the VA guide: 816×1056 px,
 * `s-` classes inside `.sp`, Roboto light + Cormorant italic, The Mattheis
 * Team + The Surek Group branding only.
 *
 * Same "no specific numbers" rule as the VA guide (Allison, 2026-09-27): no
 * rates, credit score cutoffs, premium percentages or dollar examples.
 * Exceptions: the 20% line for conventional mortgage insurance (the
 * definition of when it applies), and the program minimum down payments,
 * "as little as 3% / 3.5% down for qualified buyers" (Allison, 2026-09-28:
 * she wants buyers to see homeownership as within reach). Keep the
 * "qualified buyers" wording; not every buyer gets the minimum. The closing disclosure on page 4 is the
 * wording she approved for the worksheet; don't reword it.
 */
import shore from '../assets/loan-sheet/shore.jpg'
import mattheisLogo from '../assets/loan-sheet/mattheis-team.png'
import surekLogo from '../assets/loan-sheet/surek-group.png'
import applyQr from '../assets/loan-sheet/apply-qr.svg'
import { EMAIL, Eho, Legal, NMLS_CO, NMLS_MLO, PHONE } from './LoanSheetPages'

function RunHead({ section }: { section: string }) {
  return <div className="s-rh"><span>Your Loan Options · The Surek Group</span><span>{section}</span></div>
}

/** Two side-by-side columns, FHA on the left and conventional on the right. */
function Compare({ fha, conv, fhaSub, convSub }: {
  fha: string[]; conv: string[]; fhaSub: string; convSub: string
}) {
  const col = (name: string, sub: string, items: string[]) => (
    <div className="s-cmpcol">
      <div className="s-cmphead"><span className="s-corm">{name}</span><span>{sub}</span></div>
      {items.map((t) => <div className="s-chk" key={t}><i /><span>{t}</span></div>)}
    </div>
  )
  return (
    <div className="s-twocol" style={{ columnGap: 28 }}>
      {col('FHA', fhaSub, fha)}
      {col('Conventional', convSub, conv)}
    </div>
  )
}

const STATS: [string, string][] = [
  ['Down payment', 'how much you bring'],
  ['Insurance', 'what it is and when it ends'],
  ['Credit', 'what each loan looks for'],
  ['Closing', 'the costs to expect'],
]

const MI_FHA = [
  'Required on every FHA loan, however much you put down',
  'An upfront premium at closing, usually rolled into the loan',
  'Plus a monthly premium included in your payment',
  'With a smaller down payment it usually lasts the life of the loan; with a larger one it ends after a set period',
  'The usual way to remove it early is to refinance later',
]
const MI_CONV = [
  'Only required if you put less than 20% down',
  'Usually no upfront premium; it’s part of your monthly payment',
  'Priced on your credit score and down payment, so stronger credit pays less',
  'You can ask to remove it once you’ve built enough equity, and by law it ends automatically at a set point',
  'Other options: pay it once upfront, or have the lender cover it for a slightly higher rate',
]

const DOWN_FHA = [
  'As little as 3.5% down for qualified buyers',
  'Gift money from family can cover it',
  'Works with many down payment assistance programs',
]
const DOWN_CONV = [
  'As little as 3% down for qualified buyers, including many first-time buyers',
  'If you choose to put more down, your mortgage insurance costs less',
  'Put 20% down and there’s no mortgage insurance at all',
]

const CREDIT_FHA = [
  'More forgiving of lower credit scores',
  'Past credit events, like a bankruptcy or foreclosure, may be OK after a waiting period',
  'Often allows a higher debt-to-income ratio',
  'Pricing is generally less sensitive to your score',
]
const CREDIT_CONV = [
  'Looks for stronger credit',
  'Your rate and mortgage insurance cost improve as your score goes up',
  'Longer waiting periods after a bankruptcy or foreclosure',
  'Usually tighter on debt-to-income',
]

const SIDE: [string, string, string][] = [
  ['Backed by', 'Insured by the FHA, a government agency', 'Private, following Fannie Mae and Freddie Mac guidelines'],
  ['Down payment', 'As little as 3.5% for qualified buyers', 'As little as 3% for qualified buyers; 20% avoids mortgage insurance'],
  ['Mortgage insurance', 'Upfront and monthly, on every loan', 'Monthly, only with less than 20% down'],
  ['Removing it', 'Usually by refinancing', 'Can come off as you build equity'],
  ['Credit', 'More flexible', 'Rewards higher scores'],
  ['Property', 'Your primary home only; condos must be FHA-approved; the appraisal also checks condition', 'Primary homes, second homes and investment property'],
  ['Loan limits', 'Set by county', 'Set nationally each year, higher in some areas'],
  ['Often best for', 'Lower credit scores or a higher debt-to-income ratio', 'Stronger credit, or buyers who want mortgage insurance to go away'],
]

const FEES: [string, string, string][] = [
  ['Upfront mortgage insurance', 'Yes, usually rolled into the loan', 'Usually none'],
  ['Pricing for credit', 'Less tied to your score', 'Your credit score can affect cost, paid through your rate or points'],
  ['Appraisal', 'FHA appraisal that also checks the home’s condition', 'Standard appraisal'],
  ['Lender fees', 'Origination and processing', 'Origination and processing'],
  ['Title & settlement', 'Title search, title insurance, closing agent', 'Same on both'],
  ['Florida mortgage taxes', 'State stamp and intangible taxes, plus recording', 'Same on both'],
  ['Prepaids & escrow', 'Homeowners insurance, starting escrow, interest', 'Same on both'],
  ['Seller help', 'Seller can pay closing costs within FHA’s limits', 'Seller can pay within limits that depend on your down payment'],
]

export default function FhaConvGuidePages({ name }: { name?: string }) {
  const who = name?.trim()
  return (
    <>
      {/* ---------- page 1: welcome ---------- */}
      <div className="sp">
        <div className="s-abs" style={{ left: 0, top: 0, right: 0, height: 322, background: `url(${shore}) center 60%/cover no-repeat` }} />
        <div className="s-abs" style={{ left: 0, top: 0, right: 0, height: 322, background: 'linear-gradient(to right, rgba(10,25,45,.66) 0%, rgba(10,25,45,.28) 45%, rgba(10,25,45,0) 70%)' }} />
        <div className="s-abs" style={{ left: 0, right: 0, top: 322, height: 2, background: '#B39A5E' }} />
        <div className="s-abs s-hero">
          <div className="s-heroeyebrow">A buyer's guide to your loan options</div>
          <div className="s-herotitle">FHA vs.</div>
          <div className="s-herotitle" style={{ color: '#F1E2B8' }}>conventional</div>
          <div className="s-herorule" />
        </div>

        <div className="s-abs" style={{ left: 72, top: 360, width: 372 }}>
          <div className="s-kick">Choosing your loan</div>
          <div className="s-corm" style={{ fontSize: 26, lineHeight: 1.2, marginBottom: 12 }}>
            {who ? <>Hi {who},</> : <>Welcome,</>}
          </div>
          <p className="s-letter">
            FHA and conventional loans are the two most common ways to buy a home, and the right one depends on your
            credit, your savings and your plans. This guide walks through how they differ on mortgage insurance, down
            payment, credit and closing costs.
          </p>
          <p className="s-letter" style={{ marginBottom: 8 }}>
            When you're ready, I'll run both options side by side with your real numbers so you can choose with
            confidence.
          </p>
          <div className="s-corm" style={{ fontSize: 30, color: '#B39A5E', lineHeight: 1 }}>Allison</div>
          <div className="s-sig">Mortgage Loan Officer · NMLS #{NMLS_MLO}</div>
        </div>

        <div className="s-abs" style={{ left: 478, right: 56, top: 360 }}>
          <div className="s-honor">
            <div className="s-lbl" style={{ marginBottom: 8 }}>The short version</div>
            <div className="s-corm" style={{ fontSize: 21, lineHeight: 1.2, marginBottom: 4 }}>FHA</div>
            <p>Insured by the government. More flexible on credit, with as little as 3.5% down for qualified buyers. Mortgage insurance usually stays unless you refinance.</p>
            <div className="s-corm" style={{ fontSize: 21, lineHeight: 1.2, marginBottom: 4 }}>Conventional</div>
            <p style={{ margin: 0 }}>Not government-backed. As little as 3% down for qualified buyers. Mortgage insurance only with less than 20% down, and it can come off.</p>
          </div>
        </div>

        <div className="s-abs s-stats" style={{ left: 72, right: 72, top: 700 }}>
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

      {/* ---------- page 2: mortgage insurance + down payment ---------- */}
      <div className="sp">
        <div className="s-pad">
          <RunHead section="Insurance & Down Payment" />
          <div className="s-kick">The basics</div>
          <h3>Mortgage <em>insurance</em></h3>
          <p className="s-letter" style={{ fontSize: 12, marginBottom: 14 }}>
            Mortgage insurance protects the lender, not you, in case a loan isn't repaid. It's what makes it possible to
            buy with a smaller down payment. Both loans can have it, but they handle it very differently.
          </p>
          <Compare fhaSub="Mortgage insurance premium (MIP)" convSub="Private mortgage insurance (PMI)"
                   fha={MI_FHA} conv={MI_CONV} />

          <div className="s-kick" style={{ marginTop: 26 }}>What you bring</div>
          <h3>Down <em>payment</em></h3>
          <Compare fhaSub="Low down payment" convSub="Low down payment options too"
                   fha={DOWN_FHA} conv={DOWN_CONV} />
          <div className="s-reach">
            <div className="s-corm">Homeownership may be closer than you think</div>
            <p>
              With as little as 3% down on a conventional loan or 3.5% on FHA, plus gift money from family and down
              payment assistance programs, many buyers are ready sooner than they expect. Let's look at your numbers
              together and find the path that fits.
            </p>
          </div>
        </div>
        <Legal n={2} />
      </div>

      {/* ---------- page 3: credit + side by side ---------- */}
      <div className="sp">
        <div className="s-pad">
          <RunHead section="Credit & Comparison" />
          <div className="s-kick">What each loan looks for</div>
          <h3>Your <em>credit</em></h3>
          <Compare fhaSub="More flexible" convSub="Rewards stronger credit"
                   fha={CREDIT_FHA} conv={CREDIT_CONV} />

          <div className="s-kick" style={{ marginTop: 24 }}>At a glance</div>
          <h3>Side by <em>side</em></h3>
          <table>
            <thead><tr><th style={{ width: '22%' }} /><th>FHA</th><th>Conventional</th></tr></thead>
            <tbody>
              {SIDE.map(([k, a, b]) => (
                <tr key={k}><td>{k}</td><td style={{ fontSize: 10.8, lineHeight: 1.45 }}>{a}</td><td style={{ fontSize: 10.8, lineHeight: 1.45 }}>{b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <Legal n={3} />
      </div>

      {/* ---------- page 4: fees at closing ---------- */}
      <div className="sp">
        <div className="s-pad">
          <RunHead section="At Closing" />
          <div className="s-kick">What to expect</div>
          <h3>Fees <em>at closing</em></h3>
          <table>
            <thead><tr><th style={{ width: '24%' }}>Cost</th><th>FHA</th><th>Conventional</th></tr></thead>
            <tbody>
              {FEES.map(([k, a, b]) => (
                <tr key={k}><td>{k}</td><td style={{ fontSize: 10.8, lineHeight: 1.45 }}>{a}</td><td style={{ fontSize: 10.8, lineHeight: 1.45 }}>{b}</td></tr>
              ))}
            </tbody>
          </table>

          <div className="s-fill" style={{ marginTop: 16 }}>
            <div className="s-lbl" style={{ marginBottom: 6 }}>Every buyer is different</div>
            <p className="s-steptxt" style={{ margin: 0 }}>
              Your actual costs depend on the price, the county, your credit, your down payment and what's in your
              contract. Once we review your situation, you'll get an official Loan Estimate for the loan you choose, and
              we'll walk through every line of it together.
            </p>
          </div>

          <div className="s-cta" style={{ marginTop: 20 }}>
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
          </div>
        </div>
        <Legal n={4} />
      </div>
    </>
  )
}
