'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { SignalMessage } from '@/lib/transfer';

type Role = 'sender' | 'receiver';
type Callbacks = {
  sendSignal: (message: SignalMessage) => void;
  onChannel: (id: string, channel: RTCDataChannel) => void;
  onError: (id: string, error: unknown) => void;
};

type Peer = {
  id: string;
  connection: RTCPeerConnection;
  candidates: RTCIceCandidateInit[];
  channel?: RTCDataChannel;
  timeout: ReturnType<typeof setTimeout>;
};

export function useWebRTC(role: Role, handlers: Callbacks) {
  const activePeer = useRef<Peer | null>(null);
  const callbacks = useRef(handlers);

  useEffect(() => {
    callbacks.current = handlers;
  }, [handlers]);

  const close = useCallback(() => {
    const peer = activePeer.current;
    if (!peer) return;
    activePeer.current = null;
    clearTimeout(peer.timeout);
    peer.channel?.close();
    peer.connection.close();
  }, []);

  useEffect(() => close, [close]);

  function openPeer(id: string): Peer {
    const existing = activePeer.current;
    if (existing?.id === id) return existing;
    close();

    const connection = new RTCPeerConnection({ iceServers: [] });
    const peer: Peer = {
      id,
      connection,
      candidates: [],
      timeout: setTimeout(() => fail('The devices could not establish a local connection.'), 25_000),
    };
    activePeer.current = peer;

    function fail(message: string) {
      if (activePeer.current === peer) callbacks.current.onError(id, new Error(message));
    }

    function attachChannel(channel: RTCDataChannel) {
      if (activePeer.current !== peer || peer.channel) {
        channel.close();
        return;
      }
      peer.channel = channel;
      channel.binaryType = 'arraybuffer';
      channel.addEventListener('open', () => clearTimeout(peer.timeout), { once: true });
      channel.addEventListener('close', () => fail('The connection to the other device closed.'));
      channel.addEventListener('error', () => fail('The file connection failed.'));
      if (channel.readyState === 'open') clearTimeout(peer.timeout);
      callbacks.current.onChannel(id, channel);
    }

    connection.onicecandidate = ({ candidate }) => {
      if (!candidate || activePeer.current !== peer) return;
      try {
        callbacks.current.sendSignal({ id, type: 'candidate', data: candidate.toJSON() });
      } catch (error) {
        callbacks.current.onError(id, error);
      }
    };
    connection.oniceconnectionstatechange = () => {
      if (connection.iceConnectionState === 'failed') {
        fail('The devices could not establish a local connection.');
      }
    };
    connection.ondatachannel = ({ channel }) => {
      if (role === 'receiver' && channel.label === 'zapshare-files') attachChannel(channel);
      else channel.close();
    };
    if (role === 'sender') {
      attachChannel(connection.createDataChannel('zapshare-files', { ordered: true }));
    }
    return peer;
  }

  async function start(id: string) {
    try {
      const peer = openPeer(id);
      const { connection } = peer;
      await connection.setLocalDescription(await connection.createOffer());
      if (activePeer.current === peer && connection.localDescription) {
        callbacks.current.sendSignal({
          id,
          type: 'offer',
          data: connection.localDescription.toJSON(),
        });
      }
    } catch (error) {
      callbacks.current.onError(id, error);
    }
  }

  async function handleSignal(message: SignalMessage) {
    try {
      const peer = openPeer(message.id);
      const { connection, candidates } = peer;

      if (message.type === 'candidate') {
        if (connection.remoteDescription) await connection.addIceCandidate(message.data);
        else candidates.push(message.data);
        return;
      }

      await connection.setRemoteDescription(message.data);
      for (const candidate of candidates.splice(0)) {
        if (activePeer.current !== peer) return;
        await connection.addIceCandidate(candidate);
      }
      if (message.type === 'offer' && activePeer.current === peer) {
        await connection.setLocalDescription(await connection.createAnswer());
        if (activePeer.current === peer && connection.localDescription) {
          callbacks.current.sendSignal({
            id: message.id,
            type: 'answer',
            data: connection.localDescription.toJSON(),
          });
        }
      }
    } catch (error) {
      callbacks.current.onError(message.id, error);
    }
  }

  return { start, handleSignal, close };
}
