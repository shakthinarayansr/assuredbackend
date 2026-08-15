import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { AuthenticatedRequest } from './current-principal';
import { ApiRole, PUBLIC_KEY, ROLES_KEY } from './roles.decorator';

/**
 * Role guard for every ops endpoint (TRD §13). Ownership checks are the
 * responsibility of each service: a worker may only ever address their own
 * bookings, and that cannot be decided from the role alone.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.principal;

    if (!principal) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, 'Authentication required');
    }

    const required = this.reflector.getAllAndOverride<ApiRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    if (!required.includes(principal.role)) {
      throw new AppException(ErrorCode.FORBIDDEN, 'Not permitted for this role');
    }

    return true;
  }
}
