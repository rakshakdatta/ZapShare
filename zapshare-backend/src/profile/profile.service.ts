import { randomUUID } from 'node:crypto';
import type { Repository } from 'typeorm';
import { Profile } from './entities/profile.entity';

export type ProfileInput = Pick<Profile, 'username' | 'deviceName'>;

export class ProfileService {
  constructor(private readonly repository: Repository<Profile>) {}

  create(input: ProfileInput & { id?: string }): Promise<Profile> {
    const profile = this.repository.create({
      ...input,
      id: input.id ?? randomUUID(),
      createdAt: new Date(),
    });
    return this.repository.save(profile);
  }

  findOne(id: string): Promise<Profile | null> {
    return this.repository.findOneBy({ id });
  }

  findAll(): Promise<Profile[]> {
    return this.repository.find();
  }

  async update(
    id: string,
    changes: Partial<ProfileInput>,
  ): Promise<Profile | null> {
    if (Object.keys(changes).length > 0)
      await this.repository.update(id, changes);
    return this.findOne(id);
  }
}
