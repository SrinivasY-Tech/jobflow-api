import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { Role } from '../../src/auth/role.enum';
import { UsersService } from '../../src/users/users.service';

export interface TestApp {
  app: INestApplication;
  /** Base URL of a real listening HTTP server, e.g. http://127.0.0.1:54321 */
  url: string;
  ds: DataSource;
  tokens: Record<Role, string>;
}

export const PASSWORD = 'e2e-password-123';

/**
 * Boots the real AppModule with the same global pipes/filters as main.ts and
 * listens on a random port. A real listening server (rather than passing
 * app.getHttpServer() to supertest) matters for the concurrency tests:
 * requests arrive in parallel through real sockets.
 */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  const ds = app.get(DataSource);
  await resetDb(ds);
  const tokens = await createUsersAndLogin(app, url);
  return { app, url, ds, tokens };
}

export async function resetDb(ds: DataSource): Promise<void> {
  await ds.query('TRUNCATE assignments, jobs, workstations, users RESTART IDENTITY CASCADE');
}

async function createUsersAndLogin(app: INestApplication, url: string): Promise<Record<Role, string>> {
  const users = app.get(UsersService);
  const tokens = {} as Record<Role, string>;
  for (const role of Object.values(Role)) {
    const email = `${role}@example.com`;
    await users.create({ email, password: PASSWORD, role });
    const res = await request(url).post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    tokens[role] = (res.body as { accessToken: string }).accessToken;
  }
  return tokens;
}

export const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });
