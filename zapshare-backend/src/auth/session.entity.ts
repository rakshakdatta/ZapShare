import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('account_sessions')
export class AccountSession {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  profileId: string;

  @Column('timestamptz')
  expiresAt: Date;
}
