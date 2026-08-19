import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

/**
 * Password hashing behind one interface so the algorithm can change without
 * touching callers.
 *
 * Current algorithm: bcrypt (cost 12). The demo seeds hash with pgcrypto's
 * bcrypt, and bcryptjs is pure JS — no native build against Alpine's musl.
 * The design's argon2id target lands in the Phase 8 hardening pass: hashes
 * carry their algorithm prefix ($2 vs $argon2), so verification stays
 * seamless and old hashes upgrade on the first successful login.
 */
@Injectable()
export class PasswordService {
  private static readonly COST = 12;

  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, PasswordService.COST);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    if (!hash) return false;
    return bcrypt.compare(plain, hash);
  }
}
