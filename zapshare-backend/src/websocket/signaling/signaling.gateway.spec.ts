import { Server, Socket } from 'socket.io';
import { SignalingGateway } from './signaling.gateway';

describe('SignalingGateway', () => {
  const sender = { id: 'sender' } as Socket;
  const receiver = { id: 'receiver' } as Socket;
  const stranger = { id: 'stranger' } as Socket;
  const id = '9877330e-0614-48e7-a83e-d93183ebd181';
  const files = [{ name: 'large.zip', size: 2_000_000_000 }];
  let gateway: SignalingGateway;
  let code: string;
  let delivered: jest.Mock<void, [string | string[], string, unknown]>;
  let broadcast: jest.Mock<void, [string, unknown]>;

  beforeEach(() => {
    delivered = jest.fn<void, [string | string[], string, unknown]>();
    broadcast = jest.fn<void, [string, unknown]>();
    const server = {
      to: (destination: string | string[]) => ({
        emit: (event: string, data: unknown) =>
          delivered(destination, event, data),
      }),
      emit: broadcast,
    } as unknown as Server;
    gateway = new SignalingGateway(server);

    gateway.register(sender, { role: 'sender', name: 'Phone' });
    gateway.register(stranger, { role: 'sender', name: 'Tablet' });
    const registration = gateway.register(receiver, {
      role: 'receiver',
      name: 'Laptop',
    });
    code = registration.code!;
  });

  afterEach(() => {
    gateway.handleDisconnect(sender);
    gateway.handleDisconnect(receiver);
    gateway.handleDisconnect(stranger);
  });

  it('forwards SDP and ICE only between approved participants', () => {
    expect(gateway.requestTransfer(sender, { id, code, files })).toEqual({
      ok: true,
    });
    expect(delivered).toHaveBeenCalledWith(receiver.id, 'incoming-transfer', {
      id,
      sender: 'Phone',
      files,
    });

    const offer = {
      id,
      type: 'offer',
      data: { type: 'offer', sdp: 'offer-sdp' },
    };
    gateway.signal(sender, offer);
    expect(delivered).not.toHaveBeenCalledWith(receiver.id, 'signal', offer);
    expect(gateway.respondTransfer(stranger, { id, accept: true }).ok).toBe(
      false,
    );
    expect(gateway.respondTransfer(receiver, { id, accept: true }).ok).toBe(
      true,
    );

    const answer = {
      id,
      type: 'answer',
      data: { type: 'answer', sdp: 'answer-sdp' },
    };
    const candidate = {
      id,
      type: 'candidate',
      data: { candidate: 'ice-candidate' },
    };
    gateway.signal(stranger, offer);
    gateway.signal(sender, offer);
    gateway.signal(receiver, answer);
    gateway.signal(receiver, candidate);
    expect(
      delivered.mock.calls.filter(([, event]) => event === 'signal'),
    ).toEqual([
      [receiver.id, 'signal', offer],
      [sender.id, 'signal', answer],
      [sender.id, 'signal', candidate],
    ]);
  });

  it('releases a receiver after decline and removes it after disconnect', () => {
    expect(gateway.requestTransfer(sender, { id, code, files }).ok).toBe(true);
    expect(
      gateway.requestTransfer(stranger, {
        id: 'baca9ddd-b447-43b2-8efc-ec4f763477e6',
        code,
        files,
      }),
    ).toEqual({ ok: false, error: 'That receiver is busy.' });

    gateway.respondTransfer(receiver, { id, accept: false });
    expect(delivered).toHaveBeenCalledWith(
      [sender.id, receiver.id],
      'transfer-ended',
      {
        id,
        reason: 'declined',
      },
    );
    expect(gateway.requestTransfer(sender, { id, code, files }).ok).toBe(true);
    gateway.handleDisconnect(receiver);
    expect(delivered).toHaveBeenCalledWith(
      [sender.id, receiver.id],
      'transfer-ended',
      {
        id,
        reason: 'disconnected',
      },
    );
    expect(gateway.requestTransfer(sender, { id, code, files }).ok).toBe(false);
    expect(broadcast).toHaveBeenLastCalledWith('receivers', []);
  });
});
