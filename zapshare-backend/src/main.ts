import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { createApp } from './app';
import { AuthService, signInRequired } from './auth/auth.service';
import { createDataSource, databaseUrl } from './database/data-source';
import { DeviceService } from './device/device.service';
import { allowsWebOrigin } from './http';
import { SignalingGateway } from './websocket/signaling/signaling.gateway';

const sessionRoom = (id: string) => `account-session:${id}`;

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const dataSource = await createDataSource(databaseUrl()).initialize();
  const webOrigin = process.env.ZAPSHARE_WEB_ORIGIN;
  const app = createApp(
    dataSource,
    webOrigin,
    (id, name) => signaling.renameDevice(id, name),
    (id) => io.in(sessionRoom(id)).disconnectSockets(true),
  );
  const httpServer = createServer((request, response) => {
    void app(request, response);
  });
  const io = new Server(httpServer, {
    allowRequest(request, callback) {
      callback(
        null,
        allowsWebOrigin(
          request.headers.origin,
          request.headers.host,
          webOrigin,
        ),
      );
    },
  });
  const auth = new AuthService(dataSource);
  const signaling = new SignalingGateway(io, new DeviceService(dataSource));
  const connections = new WeakMap<
    Socket,
    NonNullable<Awaited<ReturnType<AuthService['session']>>>
  >();
  io.use((socket, next) => {
    void auth
      .session(socket.request.headers.cookie)
      .then((active) => {
        if (!active) {
          next(new Error(signInRequired));
          return;
        }
        connections.set(socket, active);
        next();
      })
      .catch(() => next(new Error('Could not check the account session.')));
  });
  io.on('connection', (socket) => {
    const active = connections.get(socket);
    if (!active) {
      socket.disconnect(true);
      return;
    }
    void socket.join(sessionRoom(active.session.id));
    const expiry = setTimeout(
      () => {
        socket.disconnect(true);
      },
      Math.max(0, active.session.expiresAt.getTime() - Date.now()),
    );
    socket.once('disconnect', () => clearTimeout(expiry));
    signaling.attach(socket, active.profile);
  });

  async function closeServices() {
    try {
      await io.close();
    } finally {
      await dataSource.destroy();
    }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, '0.0.0.0', () => {
        httpServer.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await closeServices();
    throw error;
  }

  console.log(`ZapShare Express backend listening on http://localhost:${port}`);
  let stopping = false;
  function stop() {
    if (stopping) return;
    stopping = true;
    void closeServices().catch((error: unknown) => {
      console.error(
        'Failed to shut down ZapShare:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      process.exitCode = 1;
    });
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

void main().catch((error: unknown) => {
  console.error(
    'Could not start ZapShare:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exitCode = 1;
});
