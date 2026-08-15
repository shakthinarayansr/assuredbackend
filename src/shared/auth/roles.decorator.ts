import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'assuredgig:roles';

/** The two API audiences (TRD §6.1). */
export type ApiRole = 'worker' | 'ops';

export const Roles = (...roles: ApiRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

export const PUBLIC_KEY = 'assuredgig:public';

/** Opt an endpoint out of authentication. Should be rare and deliberate. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_KEY, true);
