import { Injectable } from '@nestjs/common';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

// @node-rs/argon2 defaults to Argon2id; memoryCost is KiB.
const ARGON_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
} as const;

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argonHash(plain, ARGON_OPTIONS);
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await argonVerify(hashed, plain);
    } catch {
      return false;
    }
  }
}
