'use client';

import { useEffect, useState } from 'react';
import TransferShell from '@/components/TransferShell';
import { loadProfile, renameProfile } from '@/lib/device';
import type { Profile } from '@/lib/device';

export default function ProfilePage() {
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [account, setAccount] = useState<Profile>();
  const [status, setStatus] = useState<'connecting' | 'ready' | 'offline'>('connecting');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let alive = true;
    loadProfile().then((profile) => {
      if (!alive) return;
      setAccount(profile);
      setName(profile.name);
      setSavedName(profile.name);
      setStatus('ready');
    }).catch(() => {
      if (alive) setStatus('offline');
    });
    return () => { alive = false; };
  }, []);

  async function saveName() {
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const profile = await renameProfile(name.trim());
      setName(profile.name);
      setSavedName(profile.name);
      setFeedback('Display name saved.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save your display name.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TransferShell mode="profile" status={status}>
      <form className="transfer-panel space-y-3" onSubmit={(event) => { event.preventDefault(); void saveName(); }}>
        <div>
          <label htmlFor="display-name" className="block font-semibold">Display name</label>
          <p className="mt-1 text-sm text-muted">Other devices see this name when you send or receive files.</p>
        </div>
        <input
          id="display-name" value={name} maxLength={80} required
          disabled={status !== 'ready' || saving}
          onChange={(event) => { setName(event.target.value); setFeedback(''); }}
          className="min-h-11 w-full rounded-lg border border-outline bg-background px-3 focus-visible:outline-2 focus-visible:outline-accent"
        />
        <button type="submit" className="transfer-button transfer-button-primary" disabled={status !== 'ready' || saving || !name.trim() || savedName === name.trim()}>
          {saving ? 'Saving…' : 'Save name'}
        </button>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {feedback && <p role="status" className="text-sm text-success">{feedback}</p>}
      </form>
      {account && (
        <dl className="transfer-panel mt-4 space-y-3 text-sm">
          <div><dt className="text-muted">Username</dt><dd className="mt-1">{account.username}</dd></div>
          {account.email && <div><dt className="text-muted">Email</dt><dd className="mt-1 wrap-anywhere">{account.email}</dd></div>}
        </dl>
      )}
    </TransferShell>
  );
}
