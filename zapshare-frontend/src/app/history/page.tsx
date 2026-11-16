'use client';

import { useEffect, useState } from 'react';
import TransferFileRow from '@/components/TransferFileRow';
import TransferShell from '@/components/TransferShell';
import { loadHistory } from '@/lib/device';
import type { Direction, HistoryEntry } from '@/lib/device';

export default function HistoryPage() {
  const [direction, setDirection] = useState<Direction>('sent');
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [status, setStatus] = useState<'connecting' | 'ready' | 'offline'>('connecting');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    loadHistory(direction).then((page) => {
      if (!alive) return;
      setItems(page.items);
      setNextOffset(page.nextOffset);
      setStatus('ready');
    }).catch((failure: unknown) => {
      if (!alive) return;
      setError(failure instanceof Error ? failure.message : 'Could not load transfer history.');
      setStatus('offline');
    }).finally(() => {
      if (alive) setBusy(false);
    });
    return () => { alive = false; };
  }, [direction]);

  async function more() {
    if (nextOffset === null) return;
    setBusy(true);
    setError('');
    try {
      const page = await loadHistory(direction, nextOffset);
      setItems((previous) => [...previous, ...page.items.filter((entry) => !previous.some(({ id }) => id === entry.id))]);
      setNextOffset(page.nextOffset);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load more history.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <TransferShell mode="history" status={status}>
      <div className="mb-4 flex gap-2" aria-label="Transfer direction">
        {(['sent', 'received'] as const).map((view) => (
          <button
            key={view} type="button" aria-pressed={direction === view} disabled={busy}
            className={`transfer-button ${direction === view ? 'transfer-button-primary' : 'transfer-button-secondary'}`}
            onClick={() => {
              if (view === direction) return;
              setItems([]);
              setNextOffset(null);
              setError('');
              setBusy(true);
              setDirection(view);
            }}
          >
            {view === 'sent' ? 'Sent' : 'Received'}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}
      {busy && items.length === 0 && <p role="status" className="text-sm text-muted">Loading transfer history…</p>}
      {!busy && !error && items.length === 0 && (
        <p className="transfer-panel text-sm text-muted">{direction === 'sent' ? 'No files sent yet.' : 'No files received yet.'}</p>
      )}
      <div className="space-y-3">
        {items.map((entry) => (
          <article key={entry.id} className="transfer-panel">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold wrap-anywhere">{direction === 'sent' ? 'To' : 'From'} {entry.otherName}</h2>
              <time dateTime={entry.completedAt} className="text-xs text-muted">
                {new Date(entry.completedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </time>
            </header>
            <ul className="mt-2 divide-y divide-outline">
              {entry.files.map((file, index) => <TransferFileRow key={index} file={file} />)}
            </ul>
          </article>
        ))}
      </div>
      {nextOffset !== null && (
        <button type="button" className="transfer-button transfer-button-secondary mt-4" disabled={busy} onClick={() => void more()}>
          {busy ? 'Loading…' : 'Load more'}
        </button>
      )}
    </TransferShell>
  );
}
