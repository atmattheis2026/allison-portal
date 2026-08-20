import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'

/**
 * Passwordless login, code-based rather than a clickable link — no password
 * for anyone to set or reset, but also no "leave the app, open email, click
 * a link, come back" round trip. Supabase emails a 6-digit code; typing it
 * in here signs you in directly, same tab, no redirect needed.
 *
 * Was a magic link until 2026-08-19 — Allison found the link-per-login flow
 * too much friction. If you're tempted to bring the link back "for
 * convenience," don't — that's the exact thing this replaced.
 */
export default function Login() {
  const [stage, setStage] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const nav = useNavigate()

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithOtp({ email })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setStage('code')
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    setBusy(false)
    if (error) { setErr(error.message); return }
    nav('/admin')
  }

  if (DEMO_MODE) {
    return (
      <div className="centered">
        <div style={{ maxWidth: 380 }}>
          <div className="wordmark" style={{ fontSize: 15, marginBottom: 14 }}>Demo mode</div>
          <p className="muted" style={{ lineHeight: 1.7 }}>
            There’s no database connected yet, so there’s nothing to log in to.
            The app is running on sample data — go to <a href="/admin">/admin</a> to
            look around.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="centered">
      <form onSubmit={stage === 'email' ? sendCode : verifyCode} style={{ width: '100%', maxWidth: 340, textAlign: 'left' }}>
        <div className="wordmark" style={{ fontSize: 15, marginBottom: 20, textAlign: 'center' }}>
          Sign in
        </div>

        {stage === 'email' ? (
          <>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
              Email address
            </label>
            <input
              type="email" required value={email} autoComplete="email" autoFocus
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourcompany.com"
            />
            {err && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{err}</p>
            )}
            <button className="btn primary" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }}
                    disabled={busy}>
              {busy ? 'Sending…' : 'Email me a sign-in code'}
            </button>
            <p className="muted" style={{ fontSize: 12, marginTop: 14, lineHeight: 1.6 }}>
              No password. We email you a 6-digit code to type in here.
            </p>
          </>
        ) : (
          <>
            <p className="muted" style={{ lineHeight: 1.7, marginBottom: 14 }}>
              Check <strong style={{ color: 'var(--ink)' }}>{email}</strong> for a
              6-digit code and enter it below. It expires in an hour.
            </p>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
              Sign-in code
            </label>
            <input
              type="text" inputMode="numeric" pattern="[0-9]*" required value={code} autoFocus
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              style={{ letterSpacing: '.3em', fontSize: 20, textAlign: 'center' }}
            />
            {err && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{err}</p>
            )}
            <button className="btn primary" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }}
                    disabled={busy || code.length < 6}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <div className="savebar" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button type="button" className="btn" onClick={() => { setStage('email'); setCode(''); setErr(null) }}>
                Use a different email
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
