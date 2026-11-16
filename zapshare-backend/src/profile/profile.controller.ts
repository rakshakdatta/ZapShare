import { Router } from 'express';
import { HttpError, jsonObject, requiredText } from '../http';
import type { ProfileInput, ProfileService } from './profile.service';

export function createProfileRouter(service: ProfileService): Router {
  const router = Router();

  router.get('/', async (_request, response) => {
    response.json(await service.findAll());
  });

  router.get('/:id', async (request, response) => {
    const profile = await service.findOne(
      requiredText(request.params.id, 'id'),
    );
    if (!profile) throw new HttpError(404, 'User not found');
    response.json(profile);
  });

  router.post('/', async (request, response) => {
    const body = jsonObject(request.body);
    const profile = await service.create({
      id: body.id === undefined ? undefined : requiredText(body.id, 'id'),
      username: requiredText(body.username, 'username'),
      deviceName: requiredText(body.deviceName, 'deviceName'),
    });
    response.status(201).json(profile);
  });

  router.patch('/:id', async (request, response) => {
    const body = jsonObject(request.body);
    const changes: Partial<ProfileInput> = {};
    for (const key of ['username', 'deviceName'] as const) {
      if (body[key] !== undefined) changes[key] = requiredText(body[key], key);
    }
    const profile = await service.update(
      requiredText(request.params.id, 'id'),
      changes,
    );
    if (!profile) throw new HttpError(404, 'Profile not found');
    response.json(profile);
  });

  return router;
}
