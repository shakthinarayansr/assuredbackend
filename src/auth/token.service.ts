import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../shared/errors/app.exception';
import { ErrorCode } from '../shared/errors/error-codes';
import { Principal } from '../shared/auth/current-principal';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Refresh tokens are opaque and high-entropy, so a plain digest is enough. */
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const REFRESH_TTL_DAYS = 30;

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Starts a new session. Issuing a refresh token for a worker revokes prior
   * tokens, so a worker has one live device at a time; the displaced device
   * learns about it on its next refresh (TRD §7, BE-AUTH-04).
   */
  async issueSession(workerId: string, deviceId: string): Promise<TokenPair> {
    await this.prisma.refreshToken.updateMany({
      where: { workerId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'superseded_by_new_session' },
    });

    return this.mint(workerId, deviceId, randomUUID());
  }

  /**
   * Rotates a refresh token. Three outcomes matter:
   * unknown token → refused; already-rotated token → the whole family is
   * revoked, because a replayed token means it leaked; revoked token →
   * SESSION_SUPERSEDED, which the client renders as "signed in elsewhere".
   */
  async rotate(refreshToken: string, deviceId: string): Promise<TokenPair> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });

    if (!existing) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, 'Refresh token is not recognised');
    }

    if (existing.replacedById !== null) {
      // Reuse detection (TRD §7). The legitimate holder rotated this token
      // already, so whoever presented it again is not the legitimate holder.
      await this.revokeFamily(existing.familyId, 'refresh_token_reuse_detected');
      this.logger.error(
        { workerId: existing.workerId, familyId: existing.familyId },
        'Refresh token reuse detected — family revoked',
      );
      throw new AppException(ErrorCode.SESSION_SUPERSEDED, 'Session ended, sign in again');
    }

    if (existing.revokedAt !== null) {
      throw new AppException(ErrorCode.SESSION_SUPERSEDED, 'Session ended, sign in again');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new AppException(ErrorCode.UNAUTHENTICATED, 'Refresh token has expired');
    }

    if (existing.deviceId !== deviceId) {
      // Refresh tokens are device-bound; a token presented from another device
      // is either theft or a client bug, and neither should be honoured.
      await this.revokeFamily(existing.familyId, 'device_mismatch');
      throw new AppException(ErrorCode.SESSION_SUPERSEDED, 'Session ended, sign in again');
    }

    const pair = await this.mint(existing.workerId, deviceId, existing.familyId);

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: {
        revokedAt: new Date(),
        revokedReason: 'rotated',
        replacedById: pair.issuedId,
      },
    });

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresIn: pair.expiresIn,
    };
  }

  async revokeAllForWorker(workerId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { workerId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async mint(
    workerId: string,
    deviceId: string,
    familyId: string,
  ): Promise<TokenPair & { issuedId: string }> {
    const principal: Principal = { sub: workerId, role: 'worker', deviceId };
    const accessToken = await this.jwt.signAsync(principal);

    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

    const record = await this.prisma.refreshToken.create({
      data: { workerId, familyId, tokenHash: hashToken(refreshToken), deviceId, expiresAt },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSeconds(),
      issuedId: record.id,
    };
  }

  private accessTtlSeconds(): number {
    const raw = this.config.get<string>('JWT_ACCESS_TTL') ?? '900s';
    const match = /^(\d+)\s*([smhd]?)$/.exec(raw.trim());
    if (!match) return 900;

    const value = Number(match[1]);
    const unit = match[2] || 's';
    const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1;
    return value * multiplier;
  }
}
