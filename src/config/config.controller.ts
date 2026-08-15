import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Roles } from '../shared/auth/roles.decorator';
import { PlatformConfigService } from './config.service';

@ApiTags('config')
@Controller('config')
export class ConfigController {
  constructor(private readonly config: PlatformConfigService) {}

  /** Versioned config endpoint the client polls on launch (TRD §12). */
  @Get()
  @Roles('worker', 'ops')
  @ApiOkResponse({ description: 'Client-visible thresholds and feature flags' })
  async getConfig(): Promise<Record<string, unknown>> {
    return this.config.clientBundle();
  }
}
