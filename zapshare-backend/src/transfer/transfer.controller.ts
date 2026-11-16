import { Router } from 'express';
import {
  HttpError,
  jsonObject,
  nonnegativeInteger,
  requiredText,
} from '../http';
import type { TransferInput, TransferService } from './transfer.service';

function transferData(value: unknown, partial: false): TransferInput;
function transferData(value: unknown, partial: true): Partial<TransferInput>;
function transferData(
  value: unknown,
  partial: boolean,
): Partial<TransferInput> {
  const body = jsonObject(value);
  const result: Partial<TransferInput> = {};
  for (const key of ['senderId', 'receiverId', 'status'] as const) {
    if (!partial || body[key] !== undefined)
      result[key] = requiredText(body[key], key);
  }
  if (!partial || body.totalFiles !== undefined) {
    result.totalFiles = nonnegativeInteger(
      body.totalFiles,
      'totalFiles',
      2_147_483_647,
    );
  }
  if (!partial || body.totalSize !== undefined) {
    result.totalSize = nonnegativeInteger(
      body.totalSize,
      'totalSize',
      Number.MAX_SAFE_INTEGER,
    );
  }
  return result;
}

export function createTransferRouter(service: TransferService): Router {
  const router = Router();

  router.get('/', async (_request, response) => {
    response.json(await service.findAll());
  });

  router.get('/:id', async (request, response) => {
    const transfer = await service.findOne(
      requiredText(request.params.id, 'id'),
    );
    if (!transfer) throw new HttpError(404, 'Transfer not found');
    response.json(transfer);
  });

  router.post('/', async (request, response) => {
    const record = await service.create(transferData(request.body, false));
    response.status(201).json(record);
  });

  router.patch('/:id', async (request, response) => {
    const id = requiredText(request.params.id, 'id');
    const transfer = await service.update(id, transferData(request.body, true));
    if (!transfer) throw new HttpError(404, 'Transfer not found');
    response.json(transfer);
  });

  return router;
}
