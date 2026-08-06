import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'
import { DEMO_PAYLOAD, DEMO_SELLER } from '../lib/demoData'
import { STATUS_LABEL, type TxStatus } from '../lib/types'
import './Admin.css'

interface Row {
  id: string
  address_line: string
  city_state_zip: string
  photo_url: string | null
  status: TxStatus
  deal_type: 'buy' | 'sell'
  closing_date: string | null
  share_token: string
}

const DEMO_ROWS: Row[] = [
  {
    id: 'demo-tx',
    address_line: DEMO_PAYLOAD.transaction.address_line,
    city_state_zip: DEMO_PAYLOAD.transaction.city_state_zip,
    photo_url: DEMO_PAYLOAD.transaction.photo_url,
    status: DEMO_PAYLOAD.transaction.status,
    deal_type: 'buy',
    closing_date: DEMO_PAYLOAD.transaction.closing_date,
    share_token: 'demo',
  },
  {
    id: 'demo-sell',
    address_line: DEMO_SELLER.transaction.address_line,
    city_state_zip: DEMO_SELLER.transaction.city_state_zip,
    photo_url: DEMO_SELLER.transaction.photo_url,
    status: DEMO_SELLER.transaction.status,
    deal_type: 'sell',
    closing_date: DEMO_SELLER.transaction.closing_date,
    share_token: 'demo-sell',
  },
]

export default function AdminList() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (DEMO_MODE || !supabase) { setRows(DEMO_ROWS); return }
    supabase
      .from('transactions')
      .select('id,address_line,city_state_zip,photo_url,status,deal_type,closing_date,share_token')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error)
        setRows((data as Row[]) ?? [])
      })
  }, [])

  function copyLink(token: string) {
    const url = `${window.location.origin}/t/${token}`
    navigator.clipboard.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied(null), 1800)
  }

  if (!rows) return <div className="centered"><div className="spinner" /></div>

  return (
    <div className="admin">
      {DEMO_MODE && (
        <div className="demobar">
          Demo data — no database connected yet. Nothing you change here is saved.
        </div>
      )}

      <header className="adminbar">
        <span className="wordmark" style={{ fontSize: 15 }}>Transactions</span>
        <nav className="adminnav">
          <Link className="btn" to="/admin/settings">Settings</Link>
          <button className="btn primary">New transaction</button>
        </nav>
      </header>

      {rows.length === 0 ? (
        <div className="centered">
          <div style={{ maxWidth: 360 }}>
            <p className="muted" style={{ lineHeight: 1.7 }}>
              No transactions yet. Create one and you’ll get a link you can text
              straight to your client.
            </p>
          </div>
        </div>
      ) : (
        <div className="txlist">
          {rows.map((r) => (
            <div className="txcard" key={r.id}>
              <Link to={`/admin/t/${r.id}`} className="txmain">
                <div className="txthumb">
                  {r.photo_url
                    ? <img src={r.photo_url} alt="" />
                    : <span className="muted" style={{ fontSize: 11 }}>No photo</span>}
                </div>
                <div className="txinfo">
                  <div className="txaddr">{r.address_line || 'Untitled property'}</div>
                  <div className="txcity">{r.city_state_zip}</div>
                  <div className="txmeta">
                    <span className={`tag${r.deal_type === 'sell' ? ' sell' : ''}`}>
                      {r.deal_type === 'sell' ? 'Listing' : 'Buyer'}
                    </span>
                    <span className="muted">{STATUS_LABEL[r.status]}</span>
                    {r.closing_date && <span className="muted">· Closes {r.closing_date}</span>}
                  </div>
                </div>
              </Link>
              <button className="btn" onClick={() => copyLink(r.share_token)}>
                {copied === r.share_token ? 'Copied' : 'Copy client link'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
