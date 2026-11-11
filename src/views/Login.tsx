import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function LoginView() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-sm" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError(null)
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        setBusy(false)
        if (error) setError(/invalid/i.test(error.message) ? 'Nesprávny e-mail alebo heslo.' : `Prihlásenie zlyhalo: ${error.message}`)
      }}>
        <div className="mb-5 flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <div><h1 className="text-lg font-semibold">Organizér</h1><p className="text-xs text-ink-500">Úlohy, projekty a stretnutia</p></div>
        </div>
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" className="input mt-1" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
        <label className="label mt-3 block" htmlFor="password">Heslo</label>
        <input id="password" className="input mt-1" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button className="btn-primary mt-5 w-full py-2" disabled={busy}>{busy ? 'Prihlasujem…' : 'Prihlásiť sa'}</button>
      </form>
    </div>
  )
}
