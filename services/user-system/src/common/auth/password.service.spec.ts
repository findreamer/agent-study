import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes with argon2id and verifies correctly', async () => {
    const hashed = await passwords.hash('Admin@123456');
    expect(hashed).not.toContain('Admin@123456');
    expect(hashed.startsWith('$argon2id$')).toBe(true);
    expect(await passwords.verify(hashed, 'Admin@123456')).toBe(true);
    expect(await passwords.verify(hashed, 'wrong-password')).toBe(false);
  });

  it('verify returns false instead of throwing on malformed hash', async () => {
    expect(await passwords.verify('not-a-hash', 'whatever')).toBe(false);
  });
});
