import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcryptjs';

/**
 * Password hashing behind one interface so the algorithm can change without
 * touching callers.
 *
 * Current algorithm: argon2id (m=64MiB, t=3, p=4 — the OWASP baseline).
 * Legacy hashes still verify: every hash carries its algorithm prefix, so
 * bcrypt hashes from the seeds ($2a/$2b, via pgcrypto or bcryptjs) keep
 * working, and `needsRehash` lets the login path upgrade them to argon2id
 * the first time the correct password is seen.
 */
@Injectable()
export class PasswordService {
  private static readonly LEGACY_BCRYPT_COST = 12;

  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    if (!hash) return false;
    if (hash.startsWith('$argon2')) return argon2.verify(hash, plain);
    // bcrypt legacy: $2a$/$2b$/$2y$
    return bcrypt.compare(plain, hash);
  }

  /** True when the stored hash predates the current algorithm/parameters. */
  needsRehash(hash: string): boolean {
    if (!hash.startsWith('$argon2')) return true;
    return argon2.needsRehash(hash);
  }
}
