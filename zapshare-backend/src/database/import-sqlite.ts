import { DatabaseSync } from 'node:sqlite';
import type { DataSource } from 'typeorm';
import { Profile } from '../profile/entities/profile.entity';
import { Transfer } from '../transfer/entities/transfer.entity';
import { createDataSource, databaseUrl } from './data-source';

function text(value: unknown, column: string): string {
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new Error(`The SQLite value in ${column} is not valid text.`);
  }
  return value;
}

function date(value: unknown, column: string): Date {
  const parsed = new Date(text(value, column));
  if (Number.isNaN(parsed.getTime()))
    throw new Error(`Invalid SQLite date in ${column}.`);
  return parsed;
}

function integer(value: unknown, column: string, maximum: number): number {
  if (typeof value !== 'number' && typeof value !== 'bigint') {
    throw new Error(`The SQLite value in ${column} is not an integer.`);
  }
  const converted = Number(value);
  if (
    !Number.isSafeInteger(converted) ||
    converted < 0 ||
    converted > maximum
  ) {
    throw new Error(
      `The SQLite value in ${column} is outside the supported range.`,
    );
  }
  return converted;
}

export async function importSqlite(dataSource: DataSource, path: string) {
  const sqlite = new DatabaseSync(path, { readOnly: true });
  try {
    sqlite.exec('BEGIN');
    const profiles = sqlite.prepare(
      'SELECT id, username, deviceName, createdAt FROM users',
    );
    const transfers = sqlite.prepare(
      'SELECT transferId, senderId, receiverId, timestamp, totalFiles, totalSize, status FROM transfers',
    );
    transfers.setReadBigInts(true);

    return await dataSource.transaction(async (manager) => {
      const counts = { profiles: 0, transfers: 0 };
      for (const row of profiles.iterate()) {
        const result = await manager
          .createQueryBuilder()
          .insert()
          .into(Profile)
          .values({
            id: text(row.id, 'users.id'),
            username: text(row.username, 'users.username'),
            deviceName: text(row.deviceName, 'users.deviceName'),
            createdAt: date(row.createdAt, 'users.createdAt'),
          })
          .orIgnore()
          .returning(['id'])
          .execute();
        if (Array.isArray(result.raw)) counts.profiles += result.raw.length;
      }
      for (const row of transfers.iterate()) {
        const result = await manager
          .createQueryBuilder()
          .insert()
          .into(Transfer)
          .values({
            transferId: text(row.transferId, 'transfers.transferId'),
            senderId: text(row.senderId, 'transfers.senderId'),
            receiverId: text(row.receiverId, 'transfers.receiverId'),
            timestamp: date(row.timestamp, 'transfers.timestamp'),
            totalFiles: integer(
              row.totalFiles,
              'transfers.totalFiles',
              2_147_483_647,
            ),
            totalSize: integer(
              row.totalSize,
              'transfers.totalSize',
              Number.MAX_SAFE_INTEGER,
            ),
            status: text(row.status, 'transfers.status'),
          })
          .orIgnore()
          .returning(['transferId'])
          .execute();
        if (Array.isArray(result.raw)) counts.transfers += result.raw.length;
      }
      return counts;
    });
  } finally {
    sqlite.close();
  }
}

async function main(): Promise<void> {
  const source = await createDataSource(databaseUrl()).initialize();
  try {
    const result = await importSqlite(source, process.argv[2] ?? 'zapshare.db');
    console.log(
      `Imported ${result.profiles} profile(s) and ${result.transfers} transfer(s).`,
    );
  } finally {
    await source.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      'SQLite import failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    process.exitCode = 1;
  });
}
