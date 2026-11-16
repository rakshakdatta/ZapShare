import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DeviceHistory1794837000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const options = runner.connection.options;
    const schema = options.type === 'postgres' ? options.schema : undefined;
    await runner.createTable(
      new Table({
        name: 'device_profiles',
        schema,
        columns: [
          { name: 'id', type: 'text', isPrimary: true },
          { name: 'name', type: 'text' },
        ],
      }),
    );
    await runner.createTable(
      new Table({
        name: 'file_transfer_history',
        schema,
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'senderId', type: 'text' },
          { name: 'receiverId', type: 'text' },
          { name: 'senderName', type: 'text' },
          { name: 'receiverName', type: 'text' },
          { name: 'files', type: 'jsonb' },
          { name: 'completedAt', type: 'timestamptz' },
        ],
        indices: [
          {
            name: 'file_history_sender_date',
            columnNames: ['senderId', 'completedAt'],
          },
          {
            name: 'file_history_receiver_date',
            columnNames: ['receiverId', 'completedAt'],
          },
        ],
      }),
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    const options = runner.connection.options;
    const prefix =
      options.type === 'postgres' && options.schema ? `${options.schema}.` : '';
    await runner.dropTable(`${prefix}file_transfer_history`);
    await runner.dropTable(`${prefix}device_profiles`);
  }
}
