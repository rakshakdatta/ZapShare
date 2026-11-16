import { Router } from 'express';
import { HttpError, jsonObject, requiredText } from '../http';
import { PairingService } from './pairing.service';

export function createPairingRouter(): Router {
  const router = Router();
  const service = new PairingService();

  router.post('/register', (request, response) => {
    const body = jsonObject(request.body);
    const code = requiredText(body.code, 'code');
    const peerId = requiredText(body.peerId, 'peerId');
    const deviceName = requiredText(body.deviceName, 'deviceName');
    service.register(
      code,
      peerId,
      deviceName,
      request.ip ?? request.socket.remoteAddress ?? 'unknown',
    );
    response.status(201).json({ message: 'Registered successfully' });
  });

  router.get('/active', (_request, response) => {
    response.json(service.getActivePeers());
  });

  router.get('/resolve', (request, response) => {
    const code = requiredText(request.query.code, 'code');
    const peer = service.getPeerByCode(code);
    if (!peer) throw new HttpError(400, 'Pairing code not found or expired');
    response.json(peer);
  });

  router.post('/verify', (request, response) => {
    const body = jsonObject(request.body);
    const to = requiredText(body.to, 'to');
    const code = requiredText(body.code, 'code');
    if (!service.validatePairing(to, code))
      throw new HttpError(400, 'Invalid pairing code or peer mismatch');
    response.status(201).json({ success: true });
  });

  return router;
}
