'use client';

import { Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { logIn, signUp } from '@/lib/device';

const fieldClass = 'min-h-11 w-full rounded-lg border border-outline bg-background px-3 focus-visible:outline-2 focus-visible:outline-accent';

export default function AuthScreen({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const isSignup = mode === 'signup';
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (isSignup) await signUp(username.trim(), email.trim(), password);
      else await logIn(identifier.trim(), password);
      router.replace('/send');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not access your account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 pt-12 sm:pt-16">
      <p className="mb-6 flex items-center gap-2 font-bold">
        <span className="grid size-9 place-items-center rounded-lg bg-accent-surface text-accent">
          <Zap size={18} aria-hidden="true" />
        </span>
        ZapShare
      </p>
      <nav aria-label="Account access" className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-outline bg-surface p-1">
        <Link href="/sign-in" aria-current={!isSignup ? 'page' : undefined} className="transfer-button aria-[current=page]:bg-accent-surface aria-[current=page]:text-accent">Log in</Link>
        <Link href="/sign-up" aria-current={isSignup ? 'page' : undefined} className="transfer-button aria-[current=page]:bg-accent-surface aria-[current=page]:text-accent">Sign up</Link>
      </nav>
      <form className="transfer-panel space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <h1 className="text-2xl font-bold tracking-tight">{isSignup ? 'Create an account' : 'Log in to ZapShare'}</h1>
        {isSignup ? (
          <>
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Username</span>
              <input id="signup-username" autoCapitalize="none" autoComplete="username" required minLength={3} maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)} className={fieldClass} />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Email <span className="font-normal text-muted">(optional)</span></span>
              <input id="signup-email" type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClass} />
            </label>
          </>
        ) : (
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Email or username</span>
            <input id="login-identifier" autoCapitalize="none" autoComplete="username" required maxLength={254} value={identifier} onChange={(event) => setIdentifier(event.target.value)} className={fieldClass} />
          </label>
        )}
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Password</span>
          <input id="account-password" type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} required maxLength={128} minLength={isSignup ? 8 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} className={fieldClass} />
          {isSignup && <span className="block text-xs font-normal text-muted">Use at least 8 characters.</span>}
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="transfer-button transfer-button-primary w-full">
          {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Log in'}
        </button>
      </form>
    </main>
  );
}
