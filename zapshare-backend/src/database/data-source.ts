import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Account } from '../auth/account.entity';
import { AccountSession } from '../auth/session.entity';
import { DeviceProfile } from '../device/device.entity';
import { FileTransferHistory } from '../device/history.entity';
import { Profile } from '../profile/entities/profile.entity';
import { Transfer } from '../transfer/entities/transfer.entity';
import { InitialMetadata1760000000000 } from './migrations/1760000000000-initial-metadata';
import { DeviceHistory1794837000000 } from './migrations/1794837000000-device-history';
import { PasswordAccounts1794840000000 } from './migrations/1794840000000-password-accounts';

export function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value || !/^postgres(?:ql)?:\/\//i.test(value)) {
    throw new Error(
      'Set DATABASE_URL to a PostgreSQL connection URL in the backend .env file.',
    );
  }
  return value;
}

export function createDataSource(url: string, schema = 'public'): DataSource {
  return new DataSource({
    type: 'postgres',
    url,
    schema,
    entities: [
      Profile,
      Transfer,
      DeviceProfile,
      FileTransferHistory,
      Account,
      AccountSession,
    ],
    migrations: [
      InitialMetadata1760000000000,
      DeviceHistory1794837000000,
      PasswordAccounts1794840000000,
    ],
    migrationsTableName: 'zapshare_migrations',
    migrationsRun: true,
    synchronize: false,
    connectTimeoutMS: 5_000,
    installExtensions: false,
  });
}
