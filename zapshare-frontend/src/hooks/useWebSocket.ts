'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getBackendUrl } from '@/lib/backend-url';
import type { EndReason, FileInfo, IncomingTransfer, Receiver, SignalMessage } from '@/lib/transfer';

type Registration = { role: 'sender' | 'receiver' };
type Reply = { ok: true; code?: string } | { ok: false; error: string };
type Acknowledge = (reply: Reply) => void;
type Request = { id: string; code: string; files: FileInfo[] };
type Response = { id: string; accept: boolean };
type TransferEnd = { id: string; reason: EndReason; historySaved?: boolean };

type ServerEvents = {
  receivers: (receivers: Receiver[]) => void;
  'incoming-transfer': (transfer: IncomingTransfer) => void;
  'transfer-accepted': (transfer: { id: string }) => void;
  'transfer-ended': (transfer: TransferEnd) => void;
  signal: (message: SignalMessage) => void;
};

type ClientEvents = {
  register: (registration: Registration, acknowledge: Acknowledge) => void;
  'request-transfer': (request: Request, acknowledge: Acknowledge) => void;
  'respond-transfer': (response: Response, acknowledge: Acknowledge) => void;
  'end-transfer': (transfer: { id: string; completed: boolean }) => void;
  'transfer-received': (transfer: { id: string }) => void;
  signal: (message: SignalMessage) => void;
};

type Handlers = {
  onIncoming?: (transfer: IncomingTransfer) => void;
  onAccepted?: (id: string) => void;
  onEnded: (transfer: TransferEnd) => void;
  onSignal: (message: SignalMessage) => void;
  onDisconnect: () => void;
};

type SignalingSocket = Socket<ServerEvents, ClientEvents>;

function checkReply(reply: Reply) {
  if (!reply.ok) throw new Error(reply.error);
  return reply;
}

export function useWebSocket(role: Registration['role'], handlers: Handlers) {
  const router = useRouter();
  const socketRef = useRef<SignalingSocket | null>(null);
  const callbacks = useRef(handlers);
  const [status, setStatus] = useState<'connecting' | 'ready' | 'offline'>('connecting');
  const [code, setCode] = useState<string>();
  const [receivers, setReceivers] = useState<Receiver[]>([]);

  useEffect(() => {
    callbacks.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const socket: SignalingSocket = io(getBackendUrl(), {
      autoConnect: false,
      transports: ['websocket'],
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('connect', async () => {
      const connectionId = socket.id;
      try {
        const reply = checkReply(await socket.timeout(5000).emitWithAck('register', {
          role,
        }));
        if (!socket.connected || socket.id !== connectionId || socketRef.current !== socket) return;
        setCode(reply.code);
        setStatus('ready');
      } catch {
        if (socket.connected && socket.id === connectionId) setStatus('offline');
      }
    });
    socket.on('connect_error', (error) => {
      setStatus('offline');
      if (error.message === 'Sign in to ZapShare.') router.replace('/sign-in');
    });
    socket.on('disconnect', (reason) => {
      setStatus('offline');
      setCode(undefined);
      setReceivers([]);
      callbacks.current.onDisconnect();
      if (reason === 'io server disconnect') router.replace('/sign-in');
    });
    socket.on('receivers', setReceivers);
    socket.on('incoming-transfer', (event) => callbacks.current.onIncoming?.(event));
    socket.on('transfer-accepted', ({ id }) => callbacks.current.onAccepted?.(id));
    socket.on('transfer-ended', (event) => callbacks.current.onEnded(event));
    socket.on('signal', (event) => callbacks.current.onSignal(event));
    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [role, router]);

  function connectedSocket() {
    const socket = socketRef.current;
    if (!socket?.connected) throw new Error('The local server is offline.');
    return socket;
  }

  return {
    status,
    code,
    receivers,
    async requestTransfer(request: Request) {
      checkReply(await connectedSocket().timeout(5000).emitWithAck('request-transfer', request));
    },
    async respond(response: Response) {
      checkReply(await connectedSocket().timeout(5000).emitWithAck('respond-transfer', response));
    },
    sendSignal(message: SignalMessage) {
      connectedSocket().emit('signal', message);
    },
    endTransfer(id: string, completed = false) {
      const socket = socketRef.current;
      if (socket?.connected) socket.emit('end-transfer', { id, completed });
    },
    finishReceiving(id: string) {
      connectedSocket().emit('transfer-received', { id });
    },
  };
}
