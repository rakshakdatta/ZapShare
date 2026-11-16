import { Column, Entity, PrimaryColumn } from 'typeorm';

export type HistoryFile = { name: string; size: number };

@Entity('file_transfer_history')
export class FileTransferHistory {
  @PrimaryColumn('uuid')
  id: string;

  @Column('text')
  senderId: string;

  @Column('text')
  receiverId: string;

  @Column('text')
  senderName: string;

  @Column('text')
  receiverName: string;

  @Column('jsonb')
  files: HistoryFile[];

  @Column('timestamptz')
  completedAt: Date;
}
