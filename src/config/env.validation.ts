/**
 * Validates process.env once at startup and returns a typed config object.
 * Failing fast here means a missing DB_PASSWORD or JWT_SECRET crashes the app
 * on boot with a clear message, instead of surfacing later as a confusing error.
 *
 * Split in two so that DB-only tools (migration CLI, scripts) don't need
 * app secrets such as JWT_SECRET.
 */
export interface DbEnvConfig {
  NODE_ENV: 'development' | 'test' | 'production';
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
}

export interface EnvConfig extends DbEnvConfig {
  PORT: number;
  JWT_SECRET: string;
  JWT_EXPIRES_IN_SECONDS: number;
}

const NODE_ENVS: ReadonlyArray<DbEnvConfig['NODE_ENV']> = ['development', 'test', 'production'];
const JWT_SECRET_MIN_LENGTH = 32;

function requireString(env: Record<string, unknown>, key: string, errors: string[]): string {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${key} is required`);
    return '';
  }
  return value;
}

function requireInt(
  env: Record<string, unknown>,
  key: string,
  errors: string[],
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    const shown = typeof raw === 'string' ? raw : JSON.stringify(raw);
    errors.push(`${key} must be an integer between ${min} and ${max} (got "${shown}")`);
  }
  return value;
}

function throwIfErrors(errors: string[]): void {
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`);
  }
}

function collectDbEnv(env: Record<string, unknown>, errors: string[]): DbEnvConfig {
  const nodeEnv = (env.NODE_ENV ?? 'development') as DbEnvConfig['NODE_ENV'];
  if (!NODE_ENVS.includes(nodeEnv)) {
    errors.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}`);
  }
  return {
    NODE_ENV: nodeEnv,
    DB_HOST: requireString(env, 'DB_HOST', errors),
    DB_PORT: requireInt(env, 'DB_PORT', errors, 5432, 1, 65535),
    DB_USER: requireString(env, 'DB_USER', errors),
    DB_PASSWORD: requireString(env, 'DB_PASSWORD', errors),
    DB_NAME: requireString(env, 'DB_NAME', errors),
  };
}

/** Database settings only: used by the TypeORM CLI and scripts. */
export function validateDbEnv(env: Record<string, unknown>): DbEnvConfig {
  const errors: string[] = [];
  const config = collectDbEnv(env, errors);
  throwIfErrors(errors);
  return config;
}

/** Everything the HTTP app needs. */
export function validateEnv(env: Record<string, unknown>): EnvConfig {
  const errors: string[] = [];
  const db = collectDbEnv(env, errors);

  const jwtSecret = requireString(env, 'JWT_SECRET', errors);
  if (jwtSecret && jwtSecret.length < JWT_SECRET_MIN_LENGTH) {
    errors.push(`JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters`);
  }

  const config: EnvConfig = {
    ...db,
    PORT: requireInt(env, 'PORT', errors, 3000, 1, 65535),
    JWT_SECRET: jwtSecret,
    // Default 15 minutes. Short-lived because access tokens cannot be revoked.
    JWT_EXPIRES_IN_SECONDS: requireInt(env, 'JWT_EXPIRES_IN_SECONDS', errors, 900, 60, 86_400),
  };
  throwIfErrors(errors);
  return config;
}
