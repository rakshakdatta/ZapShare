import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Express } from 'express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createApp } from '../src/app';
import { createDataSource } from '../src/database/data-source';
import { importSqlite } from '../src/database/import-sqlite';
import { DeviceProfile } from '../src/device/device.entity';
import { FileTransferHistory } from '../src/device/history.entity';

describe('ZapShare Express API with PostgreSQL', () => {
  let app: Express;
  let admin: DataSource | undefined;
  let dataSource: DataSource | undefined;
  const schema = `zapshare_test_${randomBytes(8).toString('hex')}`;

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url)
      throw new Error('Set TEST_DATABASE_URL to a PostgreSQL test database.');
    admin = await new DataSource({ type: 'postgres', url }).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    dataSource = await createDataSource(url, schema).initialize();
    app = createApp(dataSource);
  });

  afterAll(async () => {
    await dataSource?.destroy();
    if (admin) {
      try {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await admin.destroy();
      }
    }
  });

  it('serves the health route, browser CORS, QR codes, and pairing', async () => {
    const health = await request(app)
      .get('/')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://localhost:3005')
      .expect('Access-Control-Allow-Origin', 'http://localhost:3005')
      .expect(200);
    expect(health.text).toContain('ZapShare Backend is up and running');

    const qr = await request(app).get('/qr/peer-1').expect(200);
    const qrBody = qr.body as Record<string, unknown>;
    expect(qrBody.peerId).toBe('peer-1');
    expect(qrBody.qr).toMatch(/^data:image\/png;base64,/);
    await request(app)
      .get('/qr/peer-1?type=buffer')
      .expect('Content-Type', 'image/png')
      .expect(200);

    await request(app)
      .post('/pairing/register')
      .send({ code: '1234', peerId: 'peer-1', deviceName: 'Phone' })
      .expect(201);
    await request(app).get('/pairing/resolve?code=1234').expect(200);
    await request(app)
      .post('/pairing/verify')
      .send({ code: '1234', to: 'peer-1' })
      .expect(201);
    await request(app)
      .post('/pairing/verify')
      .send({ code: '1234', to: 'peer-2' })
      .expect(400);
  });

  it('creates, reads, and updates a profile in PostgreSQL', async () => {
    const profile = {
      id: 'client-profile',
      username: 'Test user',
      deviceName: 'Test laptop',
    };
    const created = await request(app)
      .post('/profile')
      .send(profile)
      .expect(201);
    const createdProfile = created.body as Record<string, unknown>;
    expect(createdProfile).toMatchObject(profile);
    expect(typeof createdProfile.createdAt).toBe('string');
    const updated = await request(app)
      .patch('/profile/client-profile')
      .send({ deviceName: 'Desktop' })
      .expect(200);
    expect(updated.body).toMatchObject({ ...profile, deviceName: 'Desktop' });
    const fetched = await request(app)
      .get('/profile/client-profile')
      .expect(200);
    expect(fetched.body).toEqual(updated.body);
    await request(app).get('/profile/unknown').expect(404);
    await request(app)
      .post('/profile')
      .send({ username: 'Missing device' })
      .expect(400);
  });

  it('signs up, logs in by email or username, and revokes the session on logout', async () => {
    const client = request.agent(app);
    const password = 'A reliable password for testing';
    const account = {
      username: 'Office.Laptop',
      email: 'office@example.test',
      password,
    };
    await request(app).get('/device/history?direction=sent').expect(401);
    await client.post('/auth/signup').send(account).expect(201);
    await client.get('/auth/session').expect(200, {
      name: 'office.laptop',
      username: 'office.laptop',
      email: 'office@example.test',
    });
    await client
      .patch('/device/profile')
      .send({ name: 'Office laptop' })
      .expect(200, { name: 'Office laptop' });
    await request(app)
      .post('/auth/signup')
      .send({ ...account, username: 'office.laptop', email: '' })
      .expect(409);
    await request(app)
      .post('/auth/logout')
      .set('Host', 'localhost:3001')
      .set('Origin', 'http://localhost:4000')
      .expect(403);

    await client.post('/auth/logout').expect(200);
    await client.get('/auth/session').expect(401);
    await client
      .post('/auth/login')
      .send({ identifier: account.email, password: 'wrong password' })
      .expect(401);
    await client
      .post('/auth/login')
      .send({ identifier: account.email.toUpperCase(), password })
      .expect(200);
    await client.get('/device/profile').expect(200, { name: 'Office laptop' });
    await client.post('/auth/logout').expect(200);
    await client
      .post('/auth/login')
      .send({ identifier: account.username, password })
      .expect(200);
    await client
      .get('/device/history?direction=received')
      .expect(200, { items: [], nextOffset: null });
  });

  it('attaches the existing browser profile and history during signup', async () => {
    if (!dataSource) throw new Error('Test database did not initialize.');
    const legacy = 'a3'.repeat(32);
    const id = createHash('sha256')
      .update(Buffer.from(legacy, 'hex'))
      .digest('hex');
    await dataSource
      .getRepository(DeviceProfile)
      .insert({ id, name: 'My original name' });
    await dataSource.getRepository(FileTransferHistory).insert({
      id: randomUUID(),
      senderId: id,
      receiverId: 'legacy-receiver',
      senderName: 'My original name',
      receiverName: 'Old receiver',
      files: [{ name: 'notes.txt', size: 120 }],
      completedAt: new Date(),
    });

    const client = request.agent(app);
    await client
      .post('/auth/signup')
      .send({ username: 'restored', password: 'migration password', legacy })
      .expect(201);
    await client
      .get('/device/profile')
      .expect(200, { name: 'My original name' });
    const history = await client
      .get('/device/history?direction=sent')
      .expect(200);
    expect(history.body).toMatchObject({
      items: [
        {
          otherName: 'Old receiver',
          files: [{ name: 'notes.txt', size: 120 }],
        },
      ],
    });
    await request(app)
      .get('/device/history?direction=sent')
      .set('Authorization', 'Bearer ' + legacy)
      .expect(401);
  });

  it('stores and returns transfer sizes larger than a 32-bit integer', async () => {
    const transfer = {
      senderId: 'sender',
      receiverId: 'receiver',
      totalFiles: 2,
      totalSize: 8_589_934_592,
      status: 'pending',
    };
    const created = await request(app)
      .post('/transfer')
      .send(transfer)
      .expect(201);
    const { transferId } = created.body as { transferId: string };
    await request(app)
      .patch(`/transfer/${transferId}`)
      .send({ status: 'completed' })
      .expect(200);
    const stored = await request(app)
      .get(`/transfer/${transferId}`)
      .expect(200);
    expect(stored.body).toMatchObject({
      ...transfer,
      transferId,
      status: 'completed',
    });
    await request(app)
      .post('/transfer')
      .send({ ...transfer, totalSize: -1 })
      .expect(400);
  });

  it('imports SQLite metadata once and preserves the original identifiers and timestamps', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'zapshare-sqlite-test-'));
    const path = join(folder, 'fixture.db');
    try {
      const sqlite = new DatabaseSync(path);
      try {
        sqlite.exec(`
          CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, deviceName TEXT, createdAt TEXT);
          CREATE TABLE transfers (transferId TEXT PRIMARY KEY, senderId TEXT, receiverId TEXT,
            timestamp TEXT, totalFiles INTEGER, totalSize INTEGER, status TEXT);
          INSERT INTO users VALUES ('legacy-profile', 'Legacy user', 'Phone', '2025-06-14T12:00:00.000Z');
          INSERT INTO transfers VALUES ('legacy-transfer', 'a', 'b', '2025-06-14T13:00:00.000Z',
            1, 4294967296, 'completed');
        `);
      } finally {
        sqlite.close();
      }
      if (!dataSource) throw new Error('Test database did not initialize.');
      expect(await importSqlite(dataSource, path)).toEqual({
        profiles: 1,
        transfers: 1,
      });
      expect(await importSqlite(dataSource, path)).toEqual({
        profiles: 0,
        transfers: 0,
      });
      const profile = await request(app)
        .get('/profile/legacy-profile')
        .expect(200);
      expect(profile.body).toMatchObject({
        id: 'legacy-profile',
        createdAt: '2025-06-14T12:00:00.000Z',
      });
      const transfer = await request(app)
        .get('/transfer/legacy-transfer')
        .expect(200);
      expect(transfer.body).toMatchObject({
        totalSize: 4_294_967_296,
        timestamp: '2025-06-14T13:00:00.000Z',
      });
    } finally {
      rmSync(path, { force: true });
      rmdirSync(folder);
    }
  });
});
