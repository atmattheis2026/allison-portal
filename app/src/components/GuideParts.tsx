/**
 * Pieces of the printed buyer guides that change with who sends them
 * (Allison or Rich): signature, logo row, apply box and fine print. The fine
 * print is the wording Allison approved for the worksheet with the sender's
 * name, title and NMLS swapped in; don't reword it.
 */
import type { ReactNode } from 'react'
import mattheisLogo from '../assets/loan-sheet/mattheis-team.png'
import surekLogo from '../assets/loan-sheet/surek-group.png'
import { Eho, NMLS_CO, Ph, type Signer } from './LoanSheetPages'

export function SignOff({ signer }: { signer: Signer }) {
  const sig = (
    <>
      <div className="s-corm" style={{ fontSize: 30, color: '#B39A5E', lineHeight: 1 }}>{signer.first}</div>
      <div className="s-sig"><Ph v={signer.title} label="Title" /> · NMLS #<Ph v={signer.nmls} label="NMLS" /></div>
    </>
  )
  if (!signer.headshot) return sig
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <img src={signer.headshot} alt={signer.fullName}
           style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '1px solid #B39A5E', flex: 'none' }} />
      <div>{sig}</div>
    </div>
  )
}

export function LogoRow({ signer }: { signer: Signer }) {
  return (
    <div className="s-abs s-logos">
      {signer.mattheis && <>
        <img src={mattheisLogo} style={{ width: 230 }} alt="The Mattheis Team" />
        <span className="s-vrule" />
      </>}
      <img src={surekLogo} style={{ height: signer.mattheis ? 76 : 88 }} alt="The Surek Group" />
    </div>
  )
}

export function ApplyBox({ signer, style }: { signer: Signer; style?: React.CSSProperties }) {
  return (
    <div className="s-cta" style={style}>
      {signer.qr
        ? <img src={signer.qr} style={{ width: 92, height: 92, flex: 'none' }} alt="Scan to apply" />
        : <div style={{ width: 92, height: 92, flex: 'none', border: '1px dashed #b0a78f', display: 'grid', placeItems: 'center' }}><span className="s-ph">[QR]</span></div>}
      <div style={{ flex: 1 }}>
        <div className="s-corm" style={{ fontSize: 22, lineHeight: 1.1, marginBottom: 5 }}>Ready when you are</div>
        <p className="s-ctatxt">Scan to start your secure application with The Surek Group, or reach me directly.</p>
        <div className="s-ctacontact">
          <Ph v={signer.phone} label="Phone" /> &nbsp;·&nbsp; <span style={{ textTransform: 'none', letterSpacing: '.02em' }}><Ph v={signer.email} label="Email" /></span>
        </div>
      </div>
      <div style={{ borderLeft: '1px solid #E6DFCF', paddingLeft: 16 }}><img src={surekLogo} style={{ height: 64 }} alt="The Surek Group" /></div>
    </div>
  )
}

export function FinePrint({ signer, extra }: { signer: Signer; extra?: ReactNode }) {
  return (
    <div className="s-disc">
      {signer.fullName}, <Ph v={signer.title} label="Title" />, NMLS #<Ph v={signer.nmls} label="NMLS" />. The Surek Group is
      a registered trademark and DBA of US Lending Group Corporation, NMLS #{NMLS_CO}. www.nmlsconsumeraccess.org<br />
      <Eho />Equal Housing Opportunity. This is not a commitment to lend. All loans are subject to credit approval and
      program guidelines. Rates, terms and costs shown are estimates and could change.{extra ? <> {extra}</> : null}
    </div>
  )
}
