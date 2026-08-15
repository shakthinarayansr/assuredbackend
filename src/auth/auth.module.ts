import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

/**
 * otp, sessions, tokens, device binding, guards (TRD §4, §7).
 *
 * To build: OTP hashed at rest with short expiry and attempt cap; rate limits
 * per phone and per IP via Redis counters; rotating refresh tokens hashed at
 * rest and bound to a device; issuing a refresh token revokes prior tokens and
 * the displaced device receives SESSION_SUPERSEDED; reuse of an already-rotated
 * token revokes the whole family and alerts. Ops authenticates separately with
 * email, password and TOTP.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        // expiresIn is typed as a `ms` template-literal union; the value is a
        // validated env string, so it is asserted rather than re-parsed here.
        signOptions: {
          expiresIn: config.get<string>('JWT_ACCESS_TTL') ?? '15m',
        } as JwtSignOptions,
      }),
    }),
  ],
})
export class AuthModule {}
