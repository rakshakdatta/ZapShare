'use client';

import { CircleCheck, Download, FolderDown, Radio } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ProgressBar from '@/components/ProgressBar';
import TransferFileRow from '@/components/TransferFileRow';
import TransferShell from '@/components/TransferShell';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useWebSocket } from '@/hooks/useWebSocket';
import { folderPicker, receiveFiles } from '@/lib/file-transfer';
import { endMessages, formatBytes, historySaveError, totalBytes } from '@/lib/transfer';
import type { IncomingTransfer } from '@/lib/transfer';

type Phase = 'idle' | 'request' | 'connecting' | 'receiving' | 'confirming' | 'complete';
type Session = {
  offer: IncomingTransfer;
  accepted: boolean;
  complete: boolean;
  directory?: FileSystemDirectoryHandle;
  stop?: () => void;
};
type ReceivedFile = { id: string; name: string; size: number; url?: string };

export default function ReceivePage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [incoming, setIncoming] = useState<IncomingTransfer | null>(null);
  const [files, setFiles] = useState<ReceivedFile[]>([]);
  const [receivedBytes, setReceivedBytes] = useState(0);
  const [message, setMessage] = useState('');
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [canPickFolder, setCanPickFolder] = useState(false);
  const session = useRef<Session | null>(null);
  const downloadUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = downloadUrls.current;
    setCanPickFolder(typeof folderPicker() === 'function');
    return () => {
      const active = session.current;
      session.current = null;
      active?.stop?.();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const rtc = useWebRTC('receiver', {
    sendSignal: (signal) => signaling.sendSignal(signal),
    onChannel(id, channel) {
      const current = session.current;
      if (!current || current.offer.id !== id) return;
      const { files } = current.offer;
      let precedingBytes = 0;
      let currentIndex = 0;
      current.stop = receiveFiles(channel, files, {
        directory: current.directory,
        onProgress(index, bytes) {
          if (index !== currentIndex) {
            precedingBytes += files[currentIndex].size;
            currentIndex = index;
          }
          setReceivedBytes(precedingBytes + bytes);
        },
        onFile(index, blob) {
          const url = blob ? URL.createObjectURL(blob) : undefined;
          if (url) downloadUrls.current.add(url);
          const { name, size } = files[index];
          setFiles((previous) => [...previous, { id: `${id}-${index}`, name, size, url }]);
        },
        onDone() {
          current.complete = true;
          setPhase('confirming');
          try {
            signaling.finishReceiving(id);
          } catch {
            clearSession();
            setPhase('complete');
            setMessage(historySaveError);
          }
        },
        onError: (error) => fail(id, error),
      });

      const onOpen = () => {
        if (session.current === current) setPhase('receiving');
      };
      if (channel.readyState === 'open') onOpen();
      else channel.addEventListener('open', onOpen, { once: true });
    },
    onError(id, error) {
      if (!session.current?.complete) fail(id, error);
    },
  });

  const signaling = useWebSocket('receiver', {
    onIncoming(offer) {
      session.current = { offer, accepted: false, complete: false };
      setIncoming(offer);
      setReceivedBytes(0);
      setChoosingFolder(false);
      setMessage('');
      setPhase('request');
    },
    onSignal(signal) {
      const current = session.current;
      if (current?.offer.id === signal.id && current.accepted) void rtc.handleSignal(signal);
    },
    onEnded({ id, reason, historySaved }) {
      const current = session.current;
      if (current?.offer.id !== id) return;
      clearSession();
      if (current.complete) {
        setPhase('complete');
        if (historySaved === false || reason !== 'completed') setMessage(historySaveError);
        return;
      }
      setPhase('idle');
      if (reason === 'completed') setMessage('The sender ended the transfer before all files arrived.');
      else if (reason !== 'declined') setMessage(endMessages[reason]);
    },
    onDisconnect() {
      const current = session.current;
      if (!current) return;
      if (current.complete) {
        clearSession();
        setPhase('complete');
        setMessage(historySaveError);
      } else fail(current.offer.id, new Error('The local server disconnected.'));
    },
  });

  function clearSession() {
    const current = session.current;
    session.current = null;
    current?.stop?.();
    rtc.close();
    setChoosingFolder(false);
  }

  function fail(id: string, error: unknown) {
    if (session.current?.offer.id !== id) return;
    signaling.endTransfer(id);
    clearSession();
    setPhase('idle');
    setMessage(error instanceof Error ? error.message : 'The transfer failed.');
  }

  async function respond(accept: boolean, saveToFolder = false) {
    const current = session.current;
    if (!current || current.accepted) return;
    const { id } = current.offer;
    if (saveToFolder) {
      const pickFolder = folderPicker();
      if (!pickFolder) return;
      setChoosingFolder(true);
      try {
        current.directory = await pickFolder.call(window, { mode: 'readwrite' });
      } catch (error) {
        if (session.current === current) {
          setChoosingFolder(false);
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            setMessage('Could not open that folder. Try another folder or accept as a download.');
          }
        }
        return;
      }
      if (session.current !== current) return;
      setChoosingFolder(false);
    }
    setMessage('');
    if (accept) {
      current.accepted = true;
      setPhase('connecting');
    }
    try {
      await signaling.respond({ id, accept });
    } catch (error) {
      fail(id, error);
    }
  }

  const size = totalBytes(incoming?.files ?? []);
  const progress = phase === 'complete' ? 100 : size ? (receivedBytes / size) * 100 : 0;
  const active = phase === 'connecting' || phase === 'receiving';

  return (
    <TransferShell mode="receive" status={signaling.status}>
      <div className="space-y-3.5">
        {signaling.code && (
          <section className="transfer-panel flex flex-wrap items-center justify-between gap-x-5 gap-y-3" aria-label="Receiver code">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-surface text-accent">
                <Radio size={20} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Your receiver code</h2>
                {phase === 'idle' && <p className="mt-0.5 text-xs text-muted">Leave this page open to receive files.</p>}
              </div>
            </div>
            <p className="rounded-lg bg-background px-3 py-1.5 font-mono text-[26px] leading-none font-semibold tracking-[0.14em] text-accent" data-receiver-code>
              {signaling.code}
            </p>
          </section>
        )}

        {phase === 'request' && incoming && (
          <section className="transfer-panel" aria-labelledby="incoming-request">
            <h2 id="incoming-request" className="font-semibold">{incoming.sender} wants to send files</h2>
            <p className="mt-1 text-sm text-muted">
              {incoming.files.length} {incoming.files.length === 1 ? 'file' : 'files'} · {formatBytes(size)}
            </p>
            <ul className="mt-2 max-h-64 divide-y divide-outline overflow-y-auto">
              {incoming.files.map((file, index) => <TransferFileRow key={index} file={file} />)}
            </ul>
            <fieldset disabled={choosingFolder} aria-label="Respond to request" className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="transfer-button transfer-button-primary" onClick={() => void respond(true)}>
                Accept
              </button>
              {canPickFolder && (
                <button
                  type="button"
                  className="transfer-button transfer-button-secondary"
                  onClick={() => void respond(true, true)}
                >
                  <FolderDown size={16} aria-hidden="true" />
                  Save to folder
                </button>
              )}
              <button type="button" className="transfer-button transfer-button-secondary" onClick={() => void respond(false)}>
                Decline
              </button>
            </fieldset>
          </section>
        )}

        {(active || phase === 'confirming' || phase === 'complete') && (
          <section className="transfer-panel space-y-3" aria-label="Transfer status">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p role="status" className={`flex items-center gap-2 font-medium ${phase === 'complete' ? 'text-success' : ''}`}>
                  {phase === 'complete' && <CircleCheck size={18} aria-hidden="true" />}
                  {phase === 'connecting' && 'Connecting to the sender…'}
                  {phase === 'receiving' && 'Receiving files…'}
                  {phase === 'confirming' && 'Finishing transfer…'}
                  {phase === 'complete' && 'Transfer complete'}
                </p>
                {phase !== 'connecting' && (
                  <p className="mt-1 text-sm text-muted">{formatBytes(receivedBytes)} of {formatBytes(size)} received</p>
                )}
              </div>
              {active && (
                <button
                  type="button"
                  className="transfer-button transfer-button-secondary"
                  onClick={() => {
                    if (session.current) fail(session.current.offer.id, new Error('Transfer cancelled.'));
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
            {phase !== 'connecting' && <ProgressBar progress={progress} />}
          </section>
        )}

        {message && <p role="alert" className="transfer-panel text-sm text-danger">{message}</p>}

        {files.length > 0 && (
          <section className="transfer-panel" aria-labelledby="received-files">
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <h2 id="received-files" className="font-semibold">Received files</h2>
              <button
                type="button"
                className="transfer-link min-h-11"
                onClick={() => {
                  downloadUrls.current.forEach((url) => URL.revokeObjectURL(url));
                  downloadUrls.current.clear();
                  setFiles([]);
                }}
              >
                Clear list
              </button>
            </div>
            <ul className="divide-y divide-outline">
              {files.map((file) => (
                <TransferFileRow key={file.id} file={file}>
                  {file.url ? (
                    <a
                      className="transfer-link inline-flex min-h-11 shrink-0 items-center gap-1.5"
                      href={file.url}
                      download={file.name}
                      aria-label={`Download ${file.name}`}
                    >
                      <Download size={16} className="hidden min-[380px]:block" aria-hidden="true" />
                      Download
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-success">Saved</span>
                  )}
                </TransferFileRow>
              ))}
            </ul>
          </section>
        )}
      </div>
    </TransferShell>
  );
}
