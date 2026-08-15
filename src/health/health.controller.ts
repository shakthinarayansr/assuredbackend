import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../shared/auth/roles.decorator';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process is up. Must not touch dependencies. */
  @Get('healthz')
  @Public()
  live(): { status: string } {
    return { status: 'ok' };
  }

  /** Readiness: dependencies are reachable and the instance may take traffic. */
  @Get('readyz')
  @Public()
  async ready(): Promise<{ status: string; database: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'ok' };
  }
}
