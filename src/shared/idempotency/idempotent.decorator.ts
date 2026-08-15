import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'assuredgig:idempotent';

/**
 * Marks a state-changing endpoint as requiring an `Idempotency-Key` header.
 * Every write endpoint should carry it (TRD §6.3).
 */
export const Idempotent = (): MethodDecorator & ClassDecorator => SetMetadata(IDEMPOTENT_KEY, true);
