import { Body, Controller, Ip, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentPrincipal, Principal } from '../shared/auth/current-principal';
import { Public, Roles } from '../shared/auth/roles.decorator';
import { Idempotent } from '../shared/idempotency/idempotent.decorator';
import { AuthService, LoginResult } from './auth.service';
import { RefreshDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';
import { TokenPair } from './token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @Public()
  @ApiOperation({ summary: 'Send a one-time code to a worker phone number' })
  @ApiOkResponse({ description: 'Code sent; the response never contains the code' })
  async requestOtp(
    @Body() dto: RequestOtpDto,
    @Ip() ip: string,
  ): Promise<{ expiresInSeconds: number }> {
    return this.auth.requestOtp(dto.phone, ip);
  }

  @Post('otp/verify')
  @Public()
  @ApiOperation({ summary: 'Exchange a one-time code for a session' })
  @ApiOkResponse({ description: 'Session issued; creates the worker on first verification' })
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<LoginResult> {
    return this.auth.verifyOtp(dto.phone, dto.code, dto.deviceId);
  }

  @Post('refresh')
  @Public()
  @ApiOperation({ summary: 'Rotate a refresh token' })
  async refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.auth.refresh(dto.refreshToken, dto.deviceId);
  }

  @Post('logout')
  @Roles('worker')
  @Idempotent()
  @ApiOperation({ summary: 'Revoke every session for the signed-in worker' })
  async logout(@CurrentPrincipal() principal: Principal): Promise<{ status: string }> {
    await this.auth.logout(principal.sub);
    return { status: 'ok' };
  }
}
