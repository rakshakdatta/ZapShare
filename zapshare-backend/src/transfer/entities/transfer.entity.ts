import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('transfers')
export class Transfer {
  @PrimaryColumn('text')
  transferId: string;

  @Column('text')
  senderId: string;

  @Column('text')
  receiverId: string;

  @Column('timestamptz')
  timestamp: Date;

  @Column('integer')
  totalFiles: number;

  @Column('bigint', {
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  totalSize: number;

  @Column('text')
  status: string;
}
