import { validateDbEnv, validateEnv } from './env.validation';

const db = { DB_HOST: 'localhost', DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'd' };
const app = { ...db, JWT_SECRET: 's'.repeat(32) };

describe('env validation', () => {
  it('applies defaults and converts numbers', () => {
    expect(validateEnv(app)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DB_PORT: 5432,
      JWT_EXPIRES_IN_SECONDS: 900,
    });
  });

  it('reports every problem at once', () => {
    expect(() => validateEnv({ DB_PORT: '99999', JWT_SECRET: 'short' })).toThrow(
      /DB_HOST is required[\s\S]*DB_PORT must be[\s\S]*JWT_SECRET must be at least 32/,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...app, NODE_ENV: 'prod' })).toThrow(/NODE_ENV must be one of/);
  });

  it('DB-only validation does not require JWT_SECRET (migration CLI, scripts)', () => {
    expect(validateDbEnv(db)).toMatchObject({ DB_HOST: 'localhost' });
  });
});
