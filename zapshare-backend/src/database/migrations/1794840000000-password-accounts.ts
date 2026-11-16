import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordAccounts1794840000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const options = runner.connection.options;
    const schema = options.type === 'postgres' ? options.schema : undefined;
    await runner.createTable(
      new Table({
        name: 'accounts',
        schema,
        columns: [
          { name: 'profileId', type: 'text', isPrimary: true },
          { name: 'username', type: 'text', isUnique: true },
          { name: 'email', type: 'text', isUnique: true, isNullable: true },
          { name: 'passwordHash', type: 'text' },
        ],
        foreignKeys: [
          {
            columnNames: ['profileId'],
            referencedTableName: 'device_profiles',
            referencedSchema: schema,
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );
    await runner.createTable(
      new Table({
        name: 'account_sessions',
        schema,
        columns: [
          { name: 'id', type: 'text', isPrimary: true },
          { name: 'profileId', type: 'text' },
          { name: 'expiresAt', type: 'timestamptz' },
        ],
        foreignKeys: [
          {
            columnNames: ['profileId'],
            referencedTableName: 'accounts',
            referencedSchema: schema,
            referencedColumnNames: ['profileId'],
            onDelete: 'CASCADE',
          },
        ],
        indices: [
          { name: 'account_sessions_expiry', columnNames: ['expiresAt'] },
        ],
      }),
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    const options = runner.connection.options;
    const prefix =
      options.type === 'postgres' && options.schema ? `${options.schema}.` : '';
    await runner.dropTable(`${prefix}account_sessions`);
    await runner.dropTable(`${prefix}accounts`);
  }
}
