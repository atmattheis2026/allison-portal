import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEMO_MODE, supabase } from '../lib/supabase'

/**
 * Passcode-first sign-in, added 2026-08-19. The email-a-code flow
 * (signInWithOtp/verifyOtp) still exists, but only as the way IN for
 * someone who has no passcode yet, or forgot theirs — not the everyday
 * path. Right after a code-verified sign-in, everyone is offered a
 * one-time "set a passcode" step (updateUser({ password })); from then on
 * they sign in with email + passcode directly, no email round trip.
 *
 * Do not make the emailed code the default screen again — Allison
 * explicitly didn't want anyone typing a code every time. Once signed in,
 * the browser also just stays signed in (Supabase's own session
 * persistence) until someone actually signs out — see the Sign out button
 * in AdminNav.tsx.
 *
 * The emailed code's length isn't something this app controls — it comes
 * back from Supabase however long Supabase makes it (6 digits by default,
 * but this project has shown 8) — so the code field must never hard-code a
 * specific length. That exact assumption broke sign-in once already.
 */
export default function Login() {
  const [stage, setStage] = useState<'password' | 'email' | 'code' | 'setPassword'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const nav = useNavigate()

  async function signInWithPasscode(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) { setErr('That email and passcode didn’t match.'); return }
    nav('/admin')
  }

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
    setStage('setPassword')
  }

  async function savePasscode(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    if (newPassword !== confirmPassword) { setErr('Those two don’t match.'); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
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
      <form
        onSubmit={
          stage === 'password' ? signInWithPasscode
          : stage === 'email' ? sendCode
          : stage === 'code' ? verifyCode
          : savePasscode
        }
        style={{ width: '100%', maxWidth: 340, textAlign: 'left' }}
      >
        <div className="wordmark" style={{ fontSize: 15, marginBottom: 20, textAlign: 'center' }}>
          Sign in
        </div>

        {stage === 'password' && (
          <>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
              Email address
            </label>
            <input
              type="email" required value={email} autoComplete="email" autoFocus
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourcompany.com"
            />
            <label className="eyebrow" style={{ display: 'block', margin: '14px 0 8px' }}>
              Passcode
            </label>
            <input
              type="password" required value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your passcode"
            />
            {err && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{err}</p>
            )}
            <button className="btn primary" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }}
                    disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <div className="savebar" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button type="button" className="btn" onClick={() => { setStage('email'); setErr(null) }}>
                First time here, or forgot your passcode?
              </button>
            </div>
          </>
        )}

        {stage === 'email' && (
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
              We’ll email you a one-time code. Once you’re in, you’ll set a passcode so you
              don’t need email again next time.
            </p>
            <div className="savebar" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button type="button" className="btn" onClick={() => { setStage('password'); setErr(null) }}>
                ← Back
              </button>
            </div>
          </>
        )}

        {stage === 'code' && (
          <>
            <p className="muted" style={{ lineHeight: 1.7, marginBottom: 14 }}>
              Check <strong style={{ color: 'var(--ink)' }}>{email}</strong> for a
              sign-in code and enter it below. It expires in an hour.
            </p>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
              Sign-in code
            </label>
            <input
              type="text" inputMode="numeric" required value={code} autoFocus
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="Code from the email"
              style={{ letterSpacing: '.2em', fontSize: 20, textAlign: 'center' }}
            />
            {err && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{err}</p>
            )}
            <button className="btn primary" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }}
                    disabled={busy || !code}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <div className="savebar" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button type="button" className="btn" onClick={() => { setStage('email'); setCode(''); setErr(null) }}>
                Use a different email
              </button>
            </div>
          </>
        )}

        {stage === 'setPassword' && (
          <>
            <p className="muted" style={{ lineHeight: 1.7, marginBottom: 14 }}>
              You’re in. Set a passcode now so next time you can skip the email step
              entirely — just your email and this passcode.
            </p>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
              New passcode
            </label>
            <input
              type="password" required value={newPassword} autoComplete="new-password" autoFocus
              minLength={6}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Needs to be at least 6 characters.
            </p>
            <label className="eyebrow" style={{ display: 'block', margin: '14px 0 8px' }}>
              Confirm passcode
            </label>
            <input
              type="password" required value={confirmPassword} autoComplete="new-password"
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Type it again"
            />
            {err && (
              <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{err}</p>
            )}
            <button className="btn primary" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }}
                    disabled={busy || newPassword.length < 6}>
              {busy ? 'Saving…' : 'Save passcode & continue'}
            </button>
            <div className="savebar" style={{ justifyContent: 'center', marginTop: 10 }}>
              <button type="button" className="btn" onClick={() => nav('/admin')}>
                Skip for now
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
