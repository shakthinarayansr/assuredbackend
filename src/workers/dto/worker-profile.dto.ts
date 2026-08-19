import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** Languages the client is localised into (BE-NOT-04 resolves templates from this). */
export const SUPPORTED_LANGUAGES = ['en', 'hi', 'ta', 'te', 'kn', 'mr', 'bn'] as const;

export class AvailabilityWindowDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Length(5, 5)
  startTime: string;

  @ApiProperty({ example: '18:00' })
  @IsString()
  @Length(5, 5)
  endTime: string;
}

/**
 * Every field is optional: the client saves the profile in steps, and a worker
 * who has filled in half of it must not lose that half.
 */
export class UpdateWorkerProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LANGUAGES })
  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  languagePref?: string;

  @ApiPropertyOptional({ description: 'Roles the worker will accept shifts for' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  roles?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  homeLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  homeLng?: number;

  @ApiPropertyOptional({ example: 'Koramangala, Bengaluru' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  homeAreaLabel?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  travelDistanceKm?: number;

  @ApiPropertyOptional({ type: [AvailabilityWindowDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityWindowDto)
  availability?: AvailabilityWindowDto[];

  @ApiPropertyOptional({ description: 'Object key from a presigned profile-photo upload' })
  @IsOptional()
  @IsString()
  @Length(1, 300)
  profilePhotoKey?: string;
}

export class WorkerProfileResponse {
  @ApiProperty() id: string;
  @ApiProperty() phone: string;
  @ApiProperty({ nullable: true }) name: string | null;
  @ApiProperty() status: string;
  @ApiProperty() languagePref: string;
  @ApiProperty({ type: [String] }) roles: string[];
  @ApiProperty({ nullable: true }) homeAreaLabel: string | null;
  @ApiProperty({ nullable: true }) homeLat: number | null;
  @ApiProperty({ nullable: true }) homeLng: number | null;
  @ApiProperty() travelDistanceKm: number;
  @ApiProperty({ nullable: true }) availability: unknown;
  @ApiProperty({ nullable: true }) profilePhotoKey: string | null;
  @ApiProperty({ description: 'True once the worker can be shortlisted for shifts' })
  profileComplete: boolean;

  @ApiProperty({ type: [String], description: 'What still needs filling in' })
  missingFields: string[];
}
