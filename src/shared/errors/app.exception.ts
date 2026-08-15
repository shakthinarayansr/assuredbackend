import { HttpException } from '@nestjs/common';

import { ERROR_STATUS, ErrorCodeValue } from './error-codes';

export interface AppErrorBody {
  code: ErrorCodeValue;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Every error the API emits carries a machine code plus a human message.
 * Throw this, never a bare HttpException.
 */
export class AppException extends HttpException {
  readonly code: ErrorCodeValue;

  constructor(code: ErrorCodeValue, message: string, details?: Record<string, unknown>) {
    super({ code, message, details } satisfies AppErrorBody, ERROR_STATUS[code]);
    this.code = code;
  }
}
