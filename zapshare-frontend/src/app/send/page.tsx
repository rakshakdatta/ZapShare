'use client';

import { ArrowUpRight, Laptop, Radio, Smartphone, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import FileDropZone from '@/components/FileDropZone';
import ProgressBar from '@/components/ProgressBar';
import TransferFileRow from '@/components/TransferFileRow';
import TransferShell from '@/components/TransferShell';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useWebSocket } from '@/hooks/useWebSocket';
import { sendFiles } from '@/lib/file-transfer';
import { endMessages, formatBytes, historySaveError, totalBytes } from '@/lib/transfer';

type Phase = 'idle' | 'waiting' | 'connecting' | 'sending' | 'confirming' | 'complete';
type Session = { id: string; files: File[]; sent?: boolean };

export default function SendPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [files, setFiles] = useState<File[]>([]);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [sentBytes, setSentBytes] = useState(0);
  const session = useRef<Session | null>(null);

  const rtc = useWebRTC('sender', {
    sendSignal: (signal) => signaling.sendSignal(signal),
    onChannel(id, channel) {
      const current = session.current;
      if (current?.id !== id) return;

      async function send(current: Session) {
        if (session.current !== current) return;
        setPhase('sending');
        let precedingBytes = 0;
        let currentIndex = 0;
        try {
          await sendFiles(channel, current.files, (index, bytes) => {
            if (session.current !== current) return;
            if (index !== currentIndex) {
              precedingBytes += current.files[currentIndex].size;
              currentIndex = index;
            }
            setSentBytes(precedingBytes + bytes);
          });
          if (session.current !== current) return;
          current.sent = true;
          setPhase('confirming');
          signaling.endTransfer(id, true);
        } catch (error) {
          fail(id, error);
        }
      }

      if (channel.readyState === 'open') void send(current);
      else channel.addEventListener('open', () => void send(current), { once: true });
    },
    onError(id, error) {
      if (!session.current?.sent) fail(id, error);
    },
  });

  const signaling = useWebSocket('sender', {
    onAccepted(id) {
      if (session.current?.id !== id) return;
      setPhase('connecting');
      void rtc.start(id);
    },
    onSignal(signal) {
      if (session.current?.id === signal.id) void rtc.handleSignal(signal);
    },
    onEnded({ id, reason, historySaved }) {
      const current = session.current;
      if (current?.id !== id) return;
      clearSession();
      if (reason === 'completed') {
        setSentBytes(totalBytes(current.files));
        setPhase('complete');
        if (historySaved === false) setMessage(historySaveError);
      } else {
        setPhase('idle');
        setMessage(endMessages[reason]);
      }
    },
    onDisconnect() {
      if (session.current) fail(session.current.id, new Error('The local server disconnected.'));
    },
  });

  function clearSession() {
    session.current = null;
    rtc.close();
  }

  function fail(id: string, error: unknown) {
    if (session.current?.id !== id) return;
    signaling.endTransfer(id);
    clearSession();
    setPhase('idle');
    setMessage(error instanceof Error ? error.message : 'The transfer failed.');
  }

  async function requestTransfer() {
    if (!canSend || session.current) return;
    const id = uuid();
    session.current = { id, files };
    setMessage('');
    setSentBytes(0);
    setPhase('waiting');
    try {
      await signaling.requestTransfer({
        id,
        code,
        files: files.map(({ name, size }) => ({ name, size })),
      });
    } catch (error) {
      fail(id, error);
    }
  }

  function updateFiles(update: (previous: File[]) => File[]) {
    setFiles(update);
    setPhase('idle');
    setMessage('');
  }

  const active = phase === 'waiting' || phase === 'connecting' || phase === 'sending' || phase === 'confirming';
  const receiver = signaling.receivers.find((candidate) => candidate.code === code);
  const hasReceiverCode = /^\d{6}$/.test(code);
  const canSend = !active && files.length > 0 && hasReceiverCode &&
    !receiver?.busy && signaling.status === 'ready';
  const size = totalBytes(files);
  const progress = phase === 'complete' ? 100 : size ? (sentBytes / size) * 100 : 0;
  const fileCount = `${files.length} ${files.length === 1 ? 'file' : 'files'}`;
  const phaseLabel = {
    idle: receiver ? `${receiver.name} selected` : hasReceiverCode ? `Code ${code} selected` : '',
    waiting: `Waiting for ${receiver?.name ?? 'the receiver'} to accept…`,
    connecting: 'Connecting to the receiver…',
    sending: 'Sending files…',
    confirming: 'Finishing transfer…',
    complete: 'Transfer complete',
  }[phase];

  return (
    <TransferShell mode="send" status={signaling.status}>
      <form
        className="space-y-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          void requestTransfer();
        }}
      >
        <div className="grid items-stretch gap-3.5 sm:grid-cols-2 sm:gap-4">
          <section className="transfer-panel" aria-labelledby="queued-files">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="queued-files" className="font-semibold">Files</h2>
              {files.length > 0 && (
                <p className="text-xs text-muted" aria-live="polite">{fileCount} · {formatBytes(size)}</p>
              )}
            </div>
            <FileDropZone
              disabled={active}
              onFilesSelected={(selection) => {
                const added = Array.from(selection);
                updateFiles((previous) => [...previous, ...added]);
              }}
            >
              {files.length > 0 && (
                <ul className="mt-2 max-h-64 divide-y divide-outline overflow-y-auto" aria-label="Selected files">
                  {files.map((file, index) => (
                    <TransferFileRow file={file} key={`${file.name}-${file.lastModified}-${index}`}>
                      <button
                        type="button"
                        aria-label={`Remove ${file.name}`}
                        disabled={active}
                        className="transfer-button size-11 shrink-0 p-0 text-muted enabled:hover:bg-background enabled:hover:text-foreground"
                        onClick={() => updateFiles((previous) => previous.filter((_, position) => position !== index))}
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </TransferFileRow>
                  ))}
                </ul>
              )}
            </FileDropZone>
          </section>

          <fieldset disabled={active} aria-labelledby="nearby-devices" className="transfer-panel">
            <h2 id="nearby-devices" className="font-semibold">Nearby devices</h2>
            {signaling.receivers.length === 0 ? (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-outline p-3">
                <Radio size={19} className="shrink-0 text-accent" aria-hidden="true" />
                <div>
                  <p className="text-sm">No receivers found</p>
                  <p className="mt-0.5 text-xs text-muted">Open Receive on the other device.</p>
                </div>
              </div>
            ) : (
              <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                {signaling.receivers.map((candidate) => {
                  const selected = candidate.code === code;
                  const DeviceIcon = /android|iphone|ipad/i.test(candidate.name) ? Smartphone : Laptop;
                  const showCode = signaling.receivers.some((other) =>
                    other.name === candidate.name && other.code !== candidate.code,
                  );
                  return (
                    <li key={candidate.code}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        disabled={candidate.busy}
                        onClick={() => {
                          setCode(candidate.code);
                          setMessage('');
                        }}
                        className="flex min-h-13 w-full items-center gap-3 rounded-lg border border-outline px-3 py-2 text-left text-sm enabled:hover:bg-accent-surface disabled:cursor-not-allowed disabled:opacity-65 aria-pressed:border-accent aria-pressed:bg-accent-surface focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                      >
                        <DeviceIcon size={16} className="shrink-0 text-accent" aria-hidden="true" />
                        <span className="min-w-0 flex-1 wrap-anywhere">
                          <span className="block">{candidate.name}</span>
                          <span className="block text-xs text-muted">
                            {candidate.busy && !(active && selected) ? 'Busy' : 'Ready to receive'}
                          </span>
                        </span>
                        {showCode && <span className="font-mono text-xs text-muted">{candidate.code}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <details className="mt-1">
              <summary className="transfer-link min-h-11 w-fit cursor-pointer py-3">Use a receiver code</summary>
              <label className="block text-xs text-muted" htmlFor="receiver-code">Six-digit receiver code</label>
              <input
                id="receiver-code"
                className="mt-1 min-h-11 w-36 rounded-lg border border-outline bg-background px-3 font-mono text-base tracking-wider focus-visible:outline-2 focus-visible:outline-accent"
                value={code}
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, ''));
                  setMessage('');
                }}
              />
            </details>
          </fieldset>
        </div>

        {message && <p role="alert" className="text-sm text-danger">{message}</p>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className={`text-sm ${phase === 'complete' ? 'text-success' : 'text-muted'}`}>{phaseLabel}</p>
          {active && phase !== 'confirming' ? (
            <button
              type="button"
              className="transfer-button transfer-button-secondary sm:shrink-0"
              onClick={() => {
                if (session.current) fail(session.current.id, new Error('Transfer cancelled.'));
              }}
            >
              Cancel
            </button>
          ) : !active && (
            <button type="submit" disabled={!canSend} className="transfer-button transfer-button-primary sm:shrink-0">
              {files.length ? `Send ${fileCount}` : 'Send files'}
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        {(phase === 'sending' || phase === 'confirming' || phase === 'complete') && (
          <div className="transfer-panel space-y-2">
            <p className="text-sm text-muted">{formatBytes(sentBytes)} of {formatBytes(size)} sent</p>
            <ProgressBar progress={progress} />
          </div>
        )}
      </form>
    </TransferShell>
  );
}
