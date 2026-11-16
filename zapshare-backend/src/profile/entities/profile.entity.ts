import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('users')
export class Profile {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  username: string;

  @Column('text')
  deviceName: string;

  @Column('timestamptz')
  createdAt: Date;
}
