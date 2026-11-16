import { Router } from 'express';
import { QrService } from './qr.service';

export function createQrRouter(): Router {
  const router = Router();
  const service = new QrService();

  router.get('/:peerId', async (request, response) => {
    const { peerId } = request.params;
    if (request.query.type === 'buffer') {
      response.type('png').send(await service.generateImageBuffer(peerId));
    } else {
      response.json({ peerId, qr: await service.generateDataURL(peerId) });
    }
  });

  return router;
}
