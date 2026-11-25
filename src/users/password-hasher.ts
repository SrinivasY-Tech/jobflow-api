import { randomBytes, scrypt, ScryptOptions, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing with Node's built-in scrypt (memory-hard KDF), so there is
 * no native dependency to compile.
 *
 * Stored format:  scrypt$N$r$p$<salt base64>$<hash base64>
 * The parameters are stored with each hash, so they can be raised later and
 * old hashes still verify (and could be re-hashed on next login).
 *
 * Parameters follow the OWASP Password Storage Cheat Sheet
 * (N=2^15, r=8, p=3, about 32 MiB of memory, ~200 ms per hash on a laptop).
 */
const N = 2 ** 15;
const R = 8;
const P = 3;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_MEM = 64 * 1024 * 1024;

function scryptAsync(password: string, salt: Buffer, keyLen: number, opts: ScryptOptions): Promise<Buffer> {
  // Async variant runs on the libuv thread pool, so it doesn't block the event loop.
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export class PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await scryptAsync(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM });
    return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, saltB64, hashB64] = parts;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAX_MEM,
    });
    // Constant-time comparison: response time doesn't reveal how many bytes matched.
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
