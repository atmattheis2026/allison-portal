import { useState } from 'react'
import { DEMO_MODE, supabase } from '../lib/supabase'

/**
 * Magic-link login. No passwords anywhere in this app, deliberately — one less
 * thing for Allison and her team to manage or reset.
 */
export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    })
    setBusy(false)
    if (error) setErr(error.message)
    else setSent(true)
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
      <form onSubmit={send} style={{ width: '100%', maxWidth: 340, textAlign: 'left' }}>
        <div className="wordmark" style={{ fontSize: 15, marginBottom: 20, textAlign: 'center' }}>
          Sign in
        </div>

        {sent ? (
          <p className="muted" style={{ lineHeight: 1.7, textAlign: 'center' }}>
            Check <strong style={{ color: 'var(--ink)' }}>{email}</strong> for a
            sign-in link. It works once and expires in an hour.
          </p>
        ) : (
          <>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
              Email address
            </label>
            <input
              type="email" required value={email} autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourcompany.com"
            />
            {err && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{err}</p>
            )}
            <button className="btn primary" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }}
                    disabled={busy}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
            <p className="muted" style={{ fontSize: 12, marginTop: 14, lineHeight: 1.6 }}>
              No password. We email you a link and clicking it signs you in.
            </p>
          </>
        )}
      </form>
    </div>
  )
}
