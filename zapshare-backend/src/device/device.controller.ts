import { Router } from 'express';
import type { AuthService } from '../auth/auth.service';
import { HttpError, jsonObject } from '../http';
import type { DeviceService } from './device.service';

export function createDeviceRouter(
  service: DeviceService,
  auth: AuthService,
  renamed?: (id: string, name: string) => void,
) {
  const router = Router();
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/profile', async (request, response) => {
    const { profile } = await auth.requireSession(request.headers.cookie);
    response.json({ name: profile.name });
  });
  router.patch('/profile', async (request, response) => {
    const {
      profile: { id },
    } = await auth.requireSession(request.headers.cookie);
    const { name } = await service.rename(id, jsonObject(request.body).name);
    renamed?.(id, name);
    response.json({ name });
  });
  router.get('/history', async (request, response) => {
    const {
      profile: { id },
    } = await auth.requireSession(request.headers.cookie);
    const { direction, offset = '0' } = request.query;
    if (direction !== 'sent' && direction !== 'received') {
      throw new HttpError(400, 'Choose sent or received history.');
    }
    if (
      typeof offset !== 'string' ||
      !/^\d+$/.test(offset) ||
      !Number.isSafeInteger(Number(offset))
    ) {
      throw new HttpError(400, 'Invalid history offset.');
    }
    response.json(await service.history(id, direction, Number(offset)));
  });
  return router;
}
