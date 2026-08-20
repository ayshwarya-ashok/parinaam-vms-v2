import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import {
  AuthPrincipal,
  CurrentUser,
  Public,
} from '../../common/decorators/auth.decorators';
import { AppConfig } from '../../config';
import { RegisterAccountDto } from '../volunteers/volunteers.dto';
import { AuthService, SessionTokens } from './auth.service';

class CredentialsDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;
}

class EmailDto {
  @IsEmail()
  email!: string;
}

const REFRESH_COOKIE = 'pvms_rt';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email + password → access token; refresh cookie set' })
  async login(
    @Body() dto: CredentialsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login(dto.email, dto.password, this.meta(req));
    return this.respond(session, res);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({
    summary: 'Register a volunteer — account and profile in one transaction',
    description:
      'Replaces the old two-step signup. An abandoned form leaves no account behind, ' +
      'and the registration lands as pending for an administrator to approve or reject.',
  })
  async register(
    @Body() dto: RegisterAccountDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.registerVolunteer(dto, this.meta(req));
    return this.respond(session, res);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('check-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Is this address free?',
    description:
      'Lets the form say "already registered" before asking for the rest. Discloses no ' +
      'more than the registration error itself, and is throttled harder than login.',
  })
  async checkEmail(@Body() dto: EmailDto) {
    return { available: await this.auth.isEmailAvailable(dto.email) };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh cookie; reuse revokes the family' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], this.meta(req));
    return this.respond(session, res);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the session family and clear the cookie' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    // Public deliberately: an expired access token must not trap a user in a
    // session they can see. The refresh cookie itself identifies what to revoke.
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @ApiOperation({ summary: 'Current principal, profile state and role' })
  me(@CurrentUser() principal: AuthPrincipal) {
    return this.auth.me(principal);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private respond(session: SessionTokens, res: Response) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, this.cookieOptions());
    return { accessToken: session.accessToken, user: session.user };
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'strict' as const,
      // Scope the cookie to the auth endpoints — no other route ever needs it.
      path: '/api/v1/auth',
      maxAge: 7 * 86_400_000,
    };
  }

  private meta(req: Request) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }
}
