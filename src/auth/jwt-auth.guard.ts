import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { AuthenticatedRequest, Principal } from '../shared/auth/current-principal';
import { PUBLIC_KEY } from '../shared/auth/roles.decorator';

/**
 * Verifies the bearer token and attaches the principal. Registered globally and
 * ahead of RolesGuard, so an endpoint is authenticated unless it opts out with
 * `@Public()` — a new controller is protected by default rather than by memory.
 *
 * This guard never rejects on its own. It establishes identity if one is
 * presented; RolesGuard decides whether the absence of identity is acceptable,
 * which keeps the "is this endpoint public" question in exactly one place.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.bearerToken(request.headers.authorization);
    if (!token) return true;

    try {
      request.principal = await this.jwt.verifyAsync<Principal>(token);
    } catch {
      // A malformed or expired token is treated as no identity at all. The
      // client's cue to refresh is the 401 that RolesGuard then raises.
    }

    return true;
  }

  private bearerToken(header: string | undefined): string | null {
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
