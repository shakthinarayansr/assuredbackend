import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

/**
 * E.164, India-first. Kept strict at the DTO boundary so no downstream code has
 * to guess whether a number carries a country code (TRD §13 whitelist policy).
 */
const E164 = /^\+[1-9]\d{7,14}$/;

export class RequestOtpDto {
  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @Matches(E164, { message: 'phone must be in E.164 format, e.g. +919876543210' })
  phone: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @Matches(E164, { message: 'phone must be in E.164 format, e.g. +919876543210' })
  phone: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiProperty({ description: 'Stable per-installation identifier; refresh tokens bind to it' })
  @IsString()
  @Length(8, 128)
  deviceId: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @Length(16, 512)
  refreshToken: string;

  @ApiProperty()
  @IsString()
  @Length(8, 128)
  deviceId: string;
}
