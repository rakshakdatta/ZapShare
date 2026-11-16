import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('device_profiles')
export class DeviceProfile {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;
}
