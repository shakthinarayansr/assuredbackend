import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, from, of, switchMap } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { IDEMPOTENT_KEY } from './idempotent.decorator';
import { IdempotencyService } from './idempotency.service';

export const IDEMPOTENCY_HEADER = 'idempotency-key';

/**
 * Applies TRD §6.3 to any handler marked @Idempotent(). Clients queue offline
 * and retry, so duplicate delivery is certain — duplicate state must be
 * impossible.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const required = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return next.handle();

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    const key = request.headers[IDEMPOTENCY_HEADER];
    if (typeof key !== 'string' || key.length === 0) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Idempotency-Key header is required for this endpoint',
      );
    }

    const endpoint = `${request.method} ${request.routeOptions?.url ?? request.url}`;
    const requestHash = this.idempotency.hashRequest(endpoint, request.body);

    return from(this.idempotency.claim(key, endpoint, requestHash)).pipe(
      switchMap((claim) => {
        if (claim.outcome === 'replay') {
          void reply.status(claim.response.statusCode);
          void reply.header('idempotent-replay', 'true');
          return of(claim.response.body);
        }

        if (claim.outcome === 'in_flight') {
          // The first copy is still running. Telling the client to retry is
          // safer than racing it.
          throw new AppException(
            ErrorCode.REQUEST_IN_FLIGHT,
            'An identical request is already being processed; retry shortly',
          );
        }

        return next.handle().pipe(
          tap((body) => {
            void this.idempotency.complete(key, reply.statusCode, body);
          }),
          catchError((error: unknown) => {
            void this.idempotency.release(key);
            throw error;
          }),
        );
      }),
    );
  }
}
