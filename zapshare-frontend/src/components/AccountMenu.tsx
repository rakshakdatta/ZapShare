'use client';

import { History, LogOut, Menu, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError, loadProfile, logOut, sessionChangeKey } from '@/lib/device';

export default function AccountMenu() {
  const router = useRouter();
  const details = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    function checkProfile(event?: StorageEvent) {
      if (event && event.key !== sessionChangeKey) return;
      void loadProfile().catch((failure: unknown) => {
        if (active && failure instanceof ApiError && failure.status === 401) router.replace('/sign-in');
      });
    }
    checkProfile();
    window.addEventListener('storage', checkProfile);
    return () => {
      active = false;
      window.removeEventListener('storage', checkProfile);
    };
  }, [router]);

  function closeMenu() {
    if (details.current) details.current.open = false;
  }

  async function leave() {
    setBusy(true);
    setError('');
    try {
      await logOut();
      closeMenu();
      router.replace('/sign-in');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not log out.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details ref={details} className="relative">
      <summary
        aria-label="Account menu"
        className="transfer-button transfer-button-secondary size-11 cursor-pointer list-none p-0 [&::-webkit-details-marker]:hidden"
      >
        <Menu size={19} aria-hidden="true" />
      </summary>
      <div className="absolute top-full right-0 z-10 mt-2 w-44 rounded-lg border border-outline bg-surface p-1.5 shadow-lg">
        <Link href="/profile" onClick={closeMenu} className="transfer-button w-full justify-start hover:bg-accent-surface">
          <UserRound size={16} aria-hidden="true" /> Profile
        </Link>
        <Link href="/history" onClick={closeMenu} className="transfer-button w-full justify-start hover:bg-accent-surface">
          <History size={16} aria-hidden="true" /> History
        </Link>
        <button
          type="button" disabled={busy}
          className="transfer-button w-full justify-start text-danger hover:bg-accent-surface"
          onClick={() => void leave()}
        >
          <LogOut size={16} aria-hidden="true" /> {busy ? 'Logging out…' : 'Log out'}
        </button>
        {error && <p role="alert" className="px-3 py-2 text-xs text-danger">{error}</p>}
      </div>
    </details>
  );
}
