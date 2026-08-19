import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';

export const IS_PUBLIC_KEY = 'isPublic';
/** Opts a route out of the global JwtAuthGuard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restricts a route to the named roles. Checked after authentication. */
export const Roles = (...roles: Array<'admin' | 'volunteer'>) =>
  SetMetadata(ROLES_KEY, roles);

/** The verified JWT payload attached to the request by JwtAuthGuard. */
export interface AuthPrincipal {
  sub: string;
  email: string;
  role: 'admin' | 'volunteer';
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const request = ctx.switchToHttp().getRequest<Request & { user: AuthPrincipal }>();
    return request.user;
  },
);
