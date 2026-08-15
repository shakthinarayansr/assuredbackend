import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

import { AppException, AppErrorBody } from './app.exception';
import { ERROR_STATUS, ErrorCode, ErrorCodeValue } from './error-codes';

@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const body = this.toBody(exception);
    const status = ERROR_STATUS[body.code];

    if (status >= 500) {
      // An unmapped 500 is a gap in the error contract, not an acceptable outcome.
      this.logger.error(
        { reqId: request.id, path: request.url, err: exception },
        'Unmapped exception reached the filter',
      );
    }

    void reply.status(status).send({ ...body, requestId: request.id });
  }

  private toBody(exception: unknown): AppErrorBody {
    if (exception instanceof AppException) {
      return exception.getResponse() as AppErrorBody;
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const status = exception.getStatus();

      // class-validator failures arrive here as { message: string[] }.
      if (typeof response === 'object' && response !== null && 'message' in response) {
        const message = response.message;
        if (Array.isArray(message)) {
          return {
            code: ErrorCode.VALIDATION_FAILED,
            message: 'Request failed validation',
            details: { issues: message },
          };
        }
      }

      return {
        code: this.codeForStatus(status),
        message: exception.message,
      };
    }

    return { code: ErrorCode.INTERNAL, message: 'Internal server error' };
  }

  private codeForStatus(status: number): ErrorCodeValue {
    switch (status) {
      case 400:
        return ErrorCode.VALIDATION_FAILED;
      case 401:
        return ErrorCode.UNAUTHENTICATED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 429:
        return ErrorCode.RATE_LIMITED;
      default:
        return ErrorCode.INTERNAL;
    }
  }
}
