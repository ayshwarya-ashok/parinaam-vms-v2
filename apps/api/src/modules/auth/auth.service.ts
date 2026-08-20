import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { BusinessException } from '../../common';
import type { AuthPrincipal } from '../../common/decorators/auth.decorators';
import { AppConfig } from '../../config';
import { RefreshToken, User, Volunteer } from '../../database/entities';
import { NotificationsService } from '../notifications';
import { PasswordService } from './password.service';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const REFRESH_TTL_DAYS = 7;

export interface SessionTokens {
  accessToken: string;
  /** Opaque value for the httpOnly cookie. Never stored — only its hash is. */
  refreshToken: string;
  user: { id: string; email: string; role: 'admin' | 'volunteer' };
}

interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Volunteer) private readonly volunteers: Repository<Volunteer>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Login ────────────────────────────────────────────────────────────────

  async login(email: string, password: string, meta: ClientMeta): Promise<SessionTokens> {
    // password_hash is select: false on the entity — ask for it explicitly.
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email })
      .getOne();

    // One generic failure for "no such account" and "wrong password":
    // distinguishing them confirms which emails exist.
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new BusinessException(
        'ACCOUNT_LOCKED',
        `Too many failed attempts. Try again after ${LOCKOUT_MINUTES} minutes.`,
        423, // Locked — not in Nest's HttpStatus enum
      );
    }

    const valid = await this.passwords.verify(password, user.passwordHash);
    if (!valid) {
      await this.recordFailure(user);
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.users.update(
      { id: user.id },
      { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    );

    // Transparent algorithm upgrade: the only moment we hold the plaintext of
    // a legacy (bcrypt) hash is a successful login, so rehash to argon2id here.
    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.users.update(
        { id: user.id },
        { passwordHash: await this.passwords.hash(password) },
      );
    }

    return this.issueSession(user, meta);
  }

  private async recordFailure(user: User): Promise<void> {
    const failures = user.failedLoginCount + 1;
    await this.users.update(
      { id: user.id },
      {
        failedLoginCount: failures,
        lockedUntil:
          failures >= MAX_FAILED_LOGINS
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
            : null,
      },
    );
  }

  // ── Signup ───────────────────────────────────────────────────────────────

  async signup(email: string, password: string, meta: ClientMeta): Promise<SessionTokens> {
    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      throw new BusinessException(
        'EMAIL_TAKEN',
        'An account with this email already exists. Try logging in.',
        409,
      );
    }

    const user = await this.users.save(
      this.users.create({
        email,
        passwordHash: await this.passwords.hash(password),
        role: 'volunteer',
      }),
    );

    // Fire-and-forget welcome mail through the outbox; a template hiccup must
    // never block account creation.
    void this.notifications
      .queueEmail({
        templateKey: 'welcome_verify',
        to: email,
        recipientType: 'volunteer',
        context: {
          firstName: 'there',
          verifyUrl: `${this.config.get('PUBLIC_WEB_URL')}/register`,
        },
      })
      .catch((err: Error) =>
        this.logger.error(`welcome email failed for ${email}: ${err.message}`),
      );

    this.logger.log(`New volunteer account: ${email}`);
    return this.issueSession(user, meta);
  }

  // ── Refresh rotation ─────────────────────────────────────────────────────

  async refresh(rawToken: string | undefined, meta: ClientMeta): Promise<SessionTokens> {
    if (!rawToken) {
      throw new UnauthorizedException('No refresh token');
    }

    const tokenHash = this.hashToken(rawToken);
    const stored = await this.refreshTokens.findOne({ where: { tokenHash } });

    if (!stored) {
      throw new UnauthorizedException('Unknown refresh token');
    }

    // Reuse of a rotated or revoked token means the token leaked — kill the
    // entire session family so the thief gets at most one use.
    if (stored.revokedAt || stored.replacedBy) {
      this.logger.warn(`Refresh token reuse detected for user ${stored.userId}`);
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.users.findOne({ where: { id: stored.userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account unavailable');
    }

    const session = await this.issueSession(user, meta);

    // Chain the rotation, then retire the old token.
    const newHash = this.hashToken(session.refreshToken);
    const replacement = await this.refreshTokens.findOne({ where: { tokenHash: newHash } });
    await this.refreshTokens.update(
      { id: stored.id },
      { revokedAt: new Date(), replacedBy: replacement?.id ?? null },
    );

    return session;
  }

  // ── Logout ───────────────────────────────────────────────────────────────

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const stored = await this.refreshTokens.findOne({
      where: { tokenHash: this.hashToken(rawToken) },
    });
    if (stored) {
      await this.revokeAllForUser(stored.userId);
    }
  }

  // ── Me ───────────────────────────────────────────────────────────────────

  async me(principal: AuthPrincipal) {
    const user = await this.users.findOne({ where: { id: principal.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account unavailable');
    }

    const volunteer =
      user.role === 'volunteer'
        ? await this.volunteers.findOne({ where: { userId: user.id } })
        : null;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      volunteer: volunteer
        ? {
            id: volunteer.id,
            firstName: volunteer.firstName,
            lastName: volunteer.lastName,
            phase: volunteer.phase,
          }
        : null,
      /** Volunteers without a profile are routed to /register by the UI. */
      profileComplete: user.role === 'admin' || volunteer !== null,
    };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async issueSession(user: User, meta: ClientMeta): Promise<SessionTokens> {
    const payload: AuthPrincipal = { sub: user.id, email: user.email, role: user.role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_TTL'),
    });

    const refreshToken = randomBytes(32).toString('base64url');
    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 400) ?? null,
      }),
    );

    return { accessToken, refreshToken, user: payload && { id: user.id, email: user.email, role: user.role } };
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokens.update(
      { userId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      { revokedAt: new Date() },
    );
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
