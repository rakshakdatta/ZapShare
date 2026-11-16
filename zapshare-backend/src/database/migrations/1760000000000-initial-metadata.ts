import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialMetadata1760000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    const schema = options.type === 'postgres' ? options.schema : undefined;

    await queryRunner.createTable(
      new Table({
        name: 'users',
        schema,
        columns: [
          { name: 'id', type: 'text', isPrimary: true },
          { name: 'username', type: 'text' },
          { name: 'deviceName', type: 'text' },
          { name: 'createdAt', type: 'timestamptz' },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'transfers',
        schema,
        columns: [
          { name: 'transferId', type: 'text', isPrimary: true },
          { name: 'senderId', type: 'text' },
          { name: 'receiverId', type: 'text' },
          { name: 'timestamp', type: 'timestamptz' },
          { name: 'totalFiles', type: 'integer' },
          { name: 'totalSize', type: 'bigint' },
          { name: 'status', type: 'text' },
        ],
        checks: [
          { name: 'transfers_file_count', expression: '"totalFiles" >= 0' },
          {
            name: 'transfers_total_size',
            expression: '"totalSize" BETWEEN 0 AND 9007199254740991',
          },
        ],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    const prefix =
      options.type === 'postgres' && options.schema ? `${options.schema}.` : '';
    await queryRunner.dropTable(`${prefix}transfers`);
    await queryRunner.dropTable(`${prefix}users`);
  }
}
