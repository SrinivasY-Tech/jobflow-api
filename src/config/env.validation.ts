/**
 * Validates process.env once at startup and returns a typed config object.
 * Failing fast here means a missing DB_PASSWORD crashes the app on boot with a
 * clear message, instead of surfacing later as a confusing connection error.
 */
export interface EnvConfig {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
}

const NODE_ENVS: ReadonlyArray<EnvConfig['NODE_ENV']> = ['development', 'test', 'production'];

function requireString(env: Record<string, unknown>, key: string, errors: string[]): string {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${key} is required`);
    return '';
  }
  return value;
}

function requirePort(
  env: Record<string, unknown>,
  key: string,
  errors: string[],
  fallback: number,
): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    errors.push(`${key} must be an integer between 1 and 65535 (got "${String(raw)}")`);
  }
  return value;
}

export function validateEnv(env: Record<string, unknown>): EnvConfig {
  const errors: string[] = [];

  const nodeEnv = (env.NODE_ENV ?? 'development') as EnvConfig['NODE_ENV'];
  if (!NODE_ENVS.includes(nodeEnv)) {
    errors.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}`);
  }

  const config: EnvConfig = {
    NODE_ENV: nodeEnv,
    PORT: requirePort(env, 'PORT', errors, 3000),
    DB_HOST: requireString(env, 'DB_HOST', errors),
    DB_PORT: requirePort(env, 'DB_PORT', errors, 5432),
    DB_USER: requireString(env, 'DB_USER', errors),
    DB_PASSWORD: requireString(env, 'DB_PASSWORD', errors),
    DB_NAME: requireString(env, 'DB_NAME', errors),
  };

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`);
  }
  return config;
}
