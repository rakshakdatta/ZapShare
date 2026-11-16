import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('accounts')
export class Account {
  @PrimaryColumn('text')
  profileId: string;

  @Column('text')
  username: string;

  @Column('text', { nullable: true })
  email: string | null;

  @Column('text')
  passwordHash: string;
}
