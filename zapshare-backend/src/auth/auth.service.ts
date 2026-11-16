import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { LessThanOrEqual, MoreThan, QueryFailedError } from 'typeorm';
import type { DataSource } from 'typeorm';
import { DeviceProfile } from '../device/device.entity';
import { HttpError, requiredText } from '../http';
import { Account } from './account.entity';
import { AccountSession } from './session.entity';

export const sessionCookie = 'zapshare_session';
export const sessionDuration = 7 * 24 * 60 * 60 * 1000;
export const signInRequired = 'Sign in to ZapShare.';

const tokenPattern = /^[a-f0-9]{64}$/i;
const dummySalt = Buffer.alloc(16);
const dummyHash = Buffer.alloc(64);

function tokenHash(token: string) {
  return createHash('sha256').update(Buffer.from(token, 'hex')).digest('hex');
}

function derivePassword(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

function passwordValue(value: unknown) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new HttpError(400, 'Password must be between 8 and 128 characters.');
  }
  return value;
}

export function readSessionToken(cookie?: string) {
  return new RegExp(
    `(?:^|;\\s*)${sessionCookie}=([a-f0-9]{64})(?:;|$)`,
    'i',
  ).exec(cookie ?? '')?.[1];
}

export type SignedInProfile = {
  id: string;
  name: string;
  username: string;
  email: string | null;
};

export class AuthService {
  constructor(private readonly source: DataSource) {}

  async signup(input: Record<string, unknown>) {
    const username = requiredText(input.username, 'Username')
      .trim()
      .toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) {
      throw new HttpError(
        400,
        'Use 3–32 letters, numbers, periods, hyphens, or underscores for the username.',
      );
    }
    const email =
      input.email === undefined || input.email === ''
        ? null
        : requiredText(input.email, 'Email').trim().toLowerCase();
    if (
      email &&
      (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ) {
      throw new HttpError(400, 'Enter a valid email address.');
    }
    const salt = randomBytes(16);
    const hash = await derivePassword(passwordValue(input.password), salt);
    try {
      return await this.source.transaction(async (manager) => {
        const legacy =
          typeof input.legacy === 'string' && tokenPattern.test(input.legacy)
            ? await manager.findOneBy(DeviceProfile, {
                id: tokenHash(input.legacy),
              })
            : null;
        const profile = legacy ?? { id: randomUUID(), name: username };
        if (!legacy) await manager.insert(DeviceProfile, profile);
        await manager.insert(Account, {
          profileId: profile.id,
          username,
          email,
          passwordHash: `${salt.toString('hex')}:${hash.toString('hex')}`,
        });
        return profile.id;
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw new HttpError(
          409,
          'That username, email, or former profile already has an account.',
        );
      }
      throw error;
    }
  }

  async login(input: Record<string, unknown>) {
    const identifier = requiredText(input.identifier, 'Email or username')
      .trim()
      .toLowerCase();
    if (identifier.length > 254)
      throw new HttpError(401, 'Email, username, or password is incorrect.');
    const password =
      typeof input.password === 'string' && input.password.length <= 128
        ? input.password
        : '';
    const account = await this.source
      .getRepository(Account)
      .findOneBy(
        identifier.includes('@')
          ? { email: identifier }
          : { username: identifier },
      );
    const [salt, hash] = account?.passwordHash.split(':') ?? [];
    const previous = hash ? Buffer.from(hash, 'hex') : dummyHash;
    const candidate = await derivePassword(
      password,
      salt ? Buffer.from(salt, 'hex') : dummySalt,
    );
    if (
      previous.length !== candidate.length ||
      !timingSafeEqual(previous, candidate) ||
      !account
    ) {
      throw new HttpError(401, 'Email, username, or password is incorrect.');
    }
    return account.profileId;
  }

  async issue(profileId: string) {
    const token = randomBytes(32).toString('hex');
    const sessions = this.source.getRepository(AccountSession);
    await sessions.delete({ expiresAt: LessThanOrEqual(new Date()) });
    await sessions.insert({
      id: tokenHash(token),
      profileId,
      expiresAt: new Date(Date.now() + sessionDuration),
    });
    return token;
  }

  async session(cookie?: string) {
    const token = readSessionToken(cookie);
    if (!token) return null;
    const session = await this.source.getRepository(AccountSession).findOneBy({
      id: tokenHash(token),
      expiresAt: MoreThan(new Date()),
    });
    if (!session) return null;
    const profile = await this.source
      .getRepository(DeviceProfile)
      .findOneBy({ id: session.profileId });
    return profile ? { session, profile } : null;
  }

  async requireSession(cookie?: string) {
    const active = await this.session(cookie);
    if (!active) throw new HttpError(401, signInRequired);
    return active;
  }

  async account(profile: DeviceProfile): Promise<SignedInProfile> {
    const { username, email } = await this.source
      .getRepository(Account)
      .findOneByOrFail({ profileId: profile.id });
    return { ...profile, username, email };
  }

  async revoke(cookie?: string) {
    const token = readSessionToken(cookie);
    if (!token) return;
    const id = tokenHash(token);
    await this.source.getRepository(AccountSession).delete(id);
    return id;
  }
}
