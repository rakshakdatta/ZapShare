import type { DataSource, Repository } from 'typeorm';
import { HttpError, requiredText } from '../http';
import { DeviceProfile } from './device.entity';
import { FileTransferHistory } from './history.entity';

const pageSize = 50;
export type Direction = 'sent' | 'received';

function displayName(input: unknown): string {
  const name = requiredText(input, 'Display name').trim();
  if (name.length > 80)
    throw new HttpError(400, 'Display name must be 80 characters or fewer.');
  return name;
}

export class DeviceService {
  private readonly profiles: Repository<DeviceProfile>;
  private readonly transfers: Repository<FileTransferHistory>;

  constructor(source: DataSource) {
    this.profiles = source.getRepository(DeviceProfile);
    this.transfers = source.getRepository(FileTransferHistory);
  }

  async rename(id: string, value: unknown): Promise<DeviceProfile> {
    const name = displayName(value);
    const result = await this.profiles.update(id, { name });
    if (!result.affected) throw new HttpError(404, 'Profile not found.');
    return { id, name };
  }

  async record(record: FileTransferHistory): Promise<void> {
    await this.transfers
      .createQueryBuilder()
      .insert()
      .values(record)
      .orIgnore()
      .execute();
  }

  async history(id: string, direction: Direction, offset: number) {
    const sent = direction === 'sent';
    const rows = await this.transfers.find({
      where: sent ? { senderId: id } : { receiverId: id },
      order: { completedAt: 'DESC', id: 'DESC' },
      skip: offset,
      take: pageSize + 1,
    });
    return {
      items: rows
        .slice(0, pageSize)
        .map(({ id, senderName, receiverName, files, completedAt }) => ({
          id,
          otherName: sent ? receiverName : senderName,
          files,
          completedAt,
        })),
      nextOffset: rows.length > pageSize ? offset + pageSize : null,
    };
  }
}
