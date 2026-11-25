import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('verifies the correct password and rejects a wrong one', async () => {
    const stored = await hasher.hash('correct horse battery');
    await expect(hasher.verify('correct horse battery', stored)).resolves.toBe(true);
    await expect(hasher.verify('correct horse batterY', stored)).resolves.toBe(false);
  });

  it('stores algorithm and parameters with the hash, and salts every hash', async () => {
    const a = await hasher.hash('same-password-123');
    const b = await hasher.hash('same-password-123');
    expect(a).toMatch(/^scrypt\$32768\$8\$3\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b); // different random salts
  });

  it.each(['', 'not-a-hash', 'bcrypt$1$2$3$4$5', 'scrypt$1$2'])(
    'returns false (does not throw) for a malformed stored value: %p',
    async (stored) => {
      await expect(hasher.verify('whatever', stored)).resolves.toBe(false);
    },
  );
});
