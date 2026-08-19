import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { BusinessErrors } from '../../common';
import { AccessToken, AccessTokenPurpose } from '../../database/entities';

const LINK_TTL_DAYS = 7;
/** A double-submit inside this window updates rather than being rejected. */
const CONSUME_GRACE_MINUTES = 15;

export interface IssueInput {
  purpose: AccessTokenPurpose;
  eventId: string;
  volunteerId?: string;
  coordinatorId?: string;
  subjectEmail: string;
  createdBy?: string;
}

/**
 * BR-13 — the door for people without accounts.
 *
 * The raw token is 32 random bytes, base64url, and exists only in the email it
 * was sent in; the table stores its SHA-256. A token is single-purpose, bound
 * to exactly one occurrence (and one volunteer, when volunteer-scoped),
 * expires after 7 days and is consumed on submission.
 */
@Injectable()
export class LinkTokenService {
  constructor(
    @InjectRepository(AccessToken) private readonly tokens: Repository<AccessToken>,
  ) {}

  async issue(input: IssueInput): Promise<{ raw: string; token: AccessToken }> {
    const raw = randomBytes(32).toString('base64url');
    const token = await this.tokens.save(
      this.tokens.create({
        tokenHash: this.hash(raw),
        purpose: input.purpose,
        eventId: input.eventId,
        volunteerId: input.volunteerId ?? null,
        coordinatorId: input.coordinatorId ?? null,
        subjectEmail: input.subjectEmail,
        expiresAt: new Date(Date.now() + LINK_TTL_DAYS * 86_400_000),
        createdBy: input.createdBy ?? null,
      }),
    );
    return { raw, token };
  }

  /**
   * Validate for read access (rendering the form). A consumed token may still
   * VIEW within the grace window so the thank-you page can load after submit.
   */
  async verify(raw: string, purpose: AccessTokenPurpose): Promise<AccessToken> {
    const token = await this.tokens.findOne({ where: { tokenHash: this.hash(raw) } });

    if (!token || token.purpose !== purpose) {
      throw BusinessErrors.tokenInvalid('TOKEN_INVALID');
    }
    if (token.expiresAt < new Date()) {
      throw BusinessErrors.tokenInvalid('TOKEN_EXPIRED');
    }
    if (token.consumedAt && !this.inGrace(token.consumedAt)) {
      throw BusinessErrors.tokenInvalid('TOKEN_CONSUMED');
    }
    return token;
  }

  /**
   * Validate for a write. Returns whether this is a resubmission inside the
   * grace window — the caller updates instead of inserting.
   */
  async verifyForSubmit(
    raw: string,
    purpose: AccessTokenPurpose,
  ): Promise<{ token: AccessToken; isResubmit: boolean }> {
    const token = await this.verify(raw, purpose);
    const isResubmit = token.consumedAt !== null;
    if (!isResubmit) {
      await this.tokens.update({ id: token.id }, { consumedAt: new Date() });
    }
    return { token, isResubmit };
  }

  private inGrace(consumedAt: Date): boolean {
    return Date.now() - consumedAt.getTime() < CONSUME_GRACE_MINUTES * 60_000;
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
