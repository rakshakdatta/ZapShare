import { randomUUID } from 'node:crypto';
import type { Repository } from 'typeorm';
import { Transfer } from './entities/transfer.entity';

export type TransferInput = Pick<
  Transfer,
  'senderId' | 'receiverId' | 'totalFiles' | 'totalSize' | 'status'
>;

export class TransferService {
  constructor(private readonly repository: Repository<Transfer>) {}

  create(input: TransferInput): Promise<Transfer> {
    const record = this.repository.create({
      ...input,
      transferId: randomUUID(),
      timestamp: new Date(),
    });
    return this.repository.save(record);
  }

  findOne(transferId: string): Promise<Transfer | null> {
    return this.repository.findOneBy({ transferId });
  }

  findAll(): Promise<Transfer[]> {
    return this.repository.find();
  }

  async update(
    transferId: string,
    changes: Partial<TransferInput>,
  ): Promise<Transfer | null> {
    if (Object.keys(changes).length > 0)
      await this.repository.update(transferId, changes);
    return this.findOne(transferId);
  }
}
