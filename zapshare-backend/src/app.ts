import cors from 'cors';
import express from 'express';
import type { DataSource } from 'typeorm';
import { createAuthRouter } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { createDeviceRouter } from './device/device.controller';
import { DeviceService } from './device/device.service';
import { allowsWebOrigin, handleHttpError, HttpError } from './http';
import { createPairingRouter } from './pairing/pairing.controller';
import { Profile } from './profile/entities/profile.entity';
import { createProfileRouter } from './profile/profile.controller';
import { ProfileService } from './profile/profile.service';
import { createQrRouter } from './qr/qr.controller';
import { Transfer } from './transfer/entities/transfer.entity';
import { createTransferRouter } from './transfer/transfer.controller';
import { TransferService } from './transfer/transfer.service';

export function createApp(
  dataSource: DataSource,
  webOrigin?: string,
  onDeviceRenamed?: (id: string, name: string) => void,
  onSessionEnded?: (id: string) => void,
) {
  const app = express();
  const auth = new AuthService(dataSource);
  app.disable('x-powered-by');
  app.use(
    cors<express.Request>((request, callback) => {
      callback(null, {
        credentials: true,
        origin: allowsWebOrigin(
          request.headers.origin,
          request.headers.host,
          webOrigin,
        ),
      });
    }),
  );
  app.use(express.json());

  app.get('/', (_request, response) => {
    response.type('text').send('ZapShare Backend is up and running 🚀');
  });
  app.use(
    '/profile',
    createProfileRouter(new ProfileService(dataSource.getRepository(Profile))),
  );
  app.use(
    '/transfer',
    createTransferRouter(
      new TransferService(dataSource.getRepository(Transfer)),
    ),
  );
  app.use('/pairing', createPairingRouter());
  app.use('/qr', createQrRouter());
  app.use(['/auth', '/device'], (request, _response, next) => {
    if (
      !allowsWebOrigin(request.headers.origin, request.headers.host, webOrigin)
    ) {
      throw new HttpError(403, 'This origin cannot access ZapShare accounts.');
    }
    next();
  });
  app.use('/auth', createAuthRouter(auth, onSessionEnded));
  app.use(
    '/device',
    createDeviceRouter(new DeviceService(dataSource), auth, onDeviceRenamed),
  );
  app.use(() => {
    throw new HttpError(404, 'Route not found');
  });
  app.use(handleHttpError);

  return app;
}
