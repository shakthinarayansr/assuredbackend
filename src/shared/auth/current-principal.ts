import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

import { ApiRole } from './roles.decorator';

export interface Principal {
  /** Worker id or ops user id. */
  sub: string;
  role: ApiRole;
  /** Present for workers only — refresh tokens are device-bound (TRD §7). */
  deviceId?: string;
}

export type AuthenticatedRequest = FastifyRequest & { principal?: Principal };

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().principal,
);
