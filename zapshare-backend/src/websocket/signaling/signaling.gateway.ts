import { randomInt, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { DeviceProfile } from '../../device/device.entity';
import type { DeviceService } from '../../device/device.service';
import type { FileTransferHistory } from '../../device/history.entity';

type Peer = {
  name: string;
  role: 'sender' | 'receiver';
  code?: string;
  deviceId?: string;
};

type FileInfo = { name: string; size: number };
type EndReason =
  | 'completed'
  | 'declined'
  | 'cancelled'
  | 'disconnected'
  | 'expired';
type Session = {
  id: string;
  sender: string;
  receiver: string;
  accepted: boolean;
  history?: Omit<FileTransferHistory, 'completedAt'>;
  completing?: boolean;
  timeout: ReturnType<typeof setTimeout>;
};

type Reply = { ok: true } | { ok: false; error: string };
type Acknowledge = (reply: Reply & { code?: string }) => void;

function hasFiles(value: unknown): value is FileInfo[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 1000 &&
    value.every(
      (file: FileInfo | null) =>
        file &&
        typeof file.name === 'string' &&
        file.name.length > 0 &&
        file.name.length <= 255 &&
        file.name !== '.' &&
        file.name !== '..' &&
        // eslint-disable-next-line no-control-regex -- Control characters are invalid in file names.
        !/[\\/\x00-\x1f]/.test(file.name) &&
        Number.isSafeInteger(file.size) &&
        file.size >= 0,
    )
  );
}

export class SignalingGateway {
  private readonly peers = new Map<string, Peer>();
  private readonly receiversByCode = new Map<string, string>();
  private readonly sessions = new Map<string, Session>();
  private readonly sessionBySocket = new Map<string, string>();

  constructor(
    readonly server: Server,
    private readonly devices?: DeviceService,
  ) {}

  attach(client: Socket, profile: DeviceProfile) {
    client.on(
      'register',
      (data: { role: Peer['role'] }, acknowledge?: Acknowledge) => {
        const reply = this.register(
          client,
          { role: data?.role, name: profile.name },
          profile,
        );
        if (typeof acknowledge === 'function') acknowledge(reply);
      },
    );
    client.on(
      'request-transfer',
      (
        data: Parameters<SignalingGateway['requestTransfer']>[1],
        acknowledge?: Acknowledge,
      ) => {
        const reply = this.requestTransfer(client, data);
        if (typeof acknowledge === 'function') acknowledge(reply);
      },
    );
    client.on(
      'respond-transfer',
      (
        data: Parameters<SignalingGateway['respondTransfer']>[1],
        acknowledge?: Acknowledge,
      ) => {
        const reply = this.respondTransfer(client, data);
        if (typeof acknowledge === 'function') acknowledge(reply);
      },
    );
    client.on('signal', (data: Parameters<SignalingGateway['signal']>[1]) =>
      this.signal(client, data),
    );
    client.on(
      'end-transfer',
      (data: Parameters<SignalingGateway['endTransfer']>[1]) =>
        this.endTransfer(client, data),
    );
    client.on('transfer-received', (data: { id: string }) => {
      void this.finishReceiving(client, data?.id);
    });
    client.on('disconnect', () => this.handleDisconnect(client));
  }

  handleDisconnect(client: Socket) {
    const peer = this.peers.get(client.id);
    if (peer?.code) this.receiversByCode.delete(peer.code);
    this.peers.delete(client.id);

    const session = this.getSession(client);
    if (session && !session.completing)
      this.endSession(session, 'disconnected');
    else if (peer?.code) this.publishReceivers();
  }

  register(
    client: Socket,
    data: { role: Peer['role']; name: string },
    profile?: DeviceProfile,
  ): Reply & { code?: string } {
    if (
      (data?.role !== 'sender' && data?.role !== 'receiver') ||
      typeof data.name !== 'string' ||
      !data.name.trim() ||
      data.name.length > 80
    ) {
      return { ok: false, error: 'Invalid device registration.' };
    }

    const existing = this.peers.get(client.id);
    if (existing) {
      return existing.role === data.role
        ? { ok: true, code: existing.code }
        : { ok: false, error: 'Reconnect to change roles.' };
    }

    const peer: Peer = {
      role: data.role,
      name: profile?.name ?? data.name.trim(),
      deviceId: profile?.id,
    };
    if (peer.role === 'receiver') {
      do {
        peer.code = randomInt(100000, 1000000).toString();
      } while (this.receiversByCode.has(peer.code));
      this.receiversByCode.set(peer.code, client.id);
    }
    this.peers.set(client.id, peer);
    this.publishReceivers();
    return { ok: true, code: peer.code };
  }

  renameDevice(id: string, name: string) {
    for (const peer of this.peers.values()) {
      if (peer.deviceId === id) peer.name = name;
    }
    this.publishReceivers();
  }

  requestTransfer(
    client: Socket,
    data: { id: string; code: string; files: FileInfo[] },
  ): Reply {
    const sender = this.peers.get(client.id);
    if (
      sender?.role !== 'sender' ||
      typeof data?.id !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(data.id) ||
      typeof data.code !== 'string' ||
      !/^\d{6}$/.test(data.code) ||
      !hasFiles(data.files)
    ) {
      return { ok: false, error: 'Invalid transfer request.' };
    }

    const receiver = this.receiversByCode.get(data.code);
    if (!receiver)
      return {
        ok: false,
        error: 'That receiver is offline or the code has changed.',
      };
    if (this.sessions.has(data.id) || this.sessionBySocket.has(client.id)) {
      return { ok: false, error: 'A transfer is already in progress.' };
    }
    if (this.sessionBySocket.has(receiver)) {
      return { ok: false, error: 'That receiver is busy.' };
    }

    const target = this.peers.get(receiver);
    const files = data.files.map(({ name, size }) => ({ name, size }));
    const session: Session = {
      id: data.id,
      sender: client.id,
      receiver,
      accepted: false,
      history:
        sender.deviceId && target?.deviceId
          ? {
              id: randomUUID(),
              senderId: sender.deviceId,
              receiverId: target.deviceId,
              senderName: sender.name,
              receiverName: target.name,
              files,
            }
          : undefined,
      timeout: setTimeout(() => this.endSession(session, 'expired'), 90_000),
    };
    this.sessions.set(session.id, session);
    this.sessionBySocket.set(session.sender, session.id);
    this.sessionBySocket.set(session.receiver, session.id);
    this.server.to(receiver).emit('incoming-transfer', {
      id: session.id,
      sender: sender.name,
      files,
    });
    this.publishReceivers();
    return { ok: true };
  }

  respondTransfer(
    client: Socket,
    data: { id: string; accept: boolean },
  ): Reply {
    const session = this.getSession(client);
    if (
      !session ||
      session.id !== data?.id ||
      session.receiver !== client.id ||
      session.accepted ||
      typeof data.accept !== 'boolean'
    ) {
      return {
        ok: false,
        error: 'This transfer request is no longer available.',
      };
    }

    if (data.accept) {
      clearTimeout(session.timeout);
      session.accepted = true;
      this.server
        .to(session.sender)
        .emit('transfer-accepted', { id: session.id });
    } else {
      this.endSession(session, 'declined');
    }
    return { ok: true };
  }

  signal(client: Socket, data: { id: string; type: string; data: unknown }) {
    const session = this.getSession(client);
    if (!session?.accepted || session.id !== data?.id) return;

    const isSender = session.sender === client.id;
    if (
      data.type !== 'candidate' &&
      data.type !== (isSender ? 'offer' : 'answer')
    ) {
      return;
    }
    this.server
      .to(isSender ? session.receiver : session.sender)
      .emit('signal', {
        id: session.id,
        type: data.type,
        data: data.data,
      });
  }

  endTransfer(client: Socket, data: { id: string; completed?: boolean }) {
    const session = this.getSession(client);
    if (!session || session.id !== data?.id || session.completing) return;
    const completed =
      data.completed === true &&
      session.accepted &&
      session.sender === client.id;
    if (completed && session.history) return;
    this.endSession(session, completed ? 'completed' : 'cancelled');
  }

  async finishReceiving(client: Socket, id: string) {
    const session = this.getSession(client);
    if (
      !session?.accepted ||
      session.id !== id ||
      session.receiver !== client.id ||
      session.completing
    )
      return;
    session.completing = true;
    let historySaved: boolean | undefined;
    if (session.history && this.devices) {
      try {
        await this.devices.record({
          ...session.history,
          completedAt: new Date(),
        });
        historySaved = true;
      } catch {
        console.error('ZapShare could not save completed transfer history.');
        historySaved = false;
      }
    }
    this.endSession(session, 'completed', historySaved);
  }

  private getSession(client: Socket) {
    const id = this.sessionBySocket.get(client.id);
    return id ? this.sessions.get(id) : undefined;
  }

  private endSession(
    session: Session,
    reason: EndReason,
    historySaved?: boolean,
  ) {
    if (!this.sessions.delete(session.id)) return;
    clearTimeout(session.timeout);
    this.sessionBySocket.delete(session.sender);
    this.sessionBySocket.delete(session.receiver);
    this.server.to([session.sender, session.receiver]).emit('transfer-ended', {
      id: session.id,
      reason,
      ...(historySaved === undefined ? {} : { historySaved }),
    });
    this.publishReceivers();
  }

  private publishReceivers() {
    const receivers = Array.from(this.receiversByCode, ([code, socketId]) => ({
      code,
      name: this.peers.get(socketId)!.name,
      busy: this.sessionBySocket.has(socketId),
    }));
    this.server.emit('receivers', receivers);
  }
}
