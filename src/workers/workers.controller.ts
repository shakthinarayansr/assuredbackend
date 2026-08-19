import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentPrincipal, Principal } from '../shared/auth/current-principal';
import { Roles } from '../shared/auth/roles.decorator';
import { Idempotent } from '../shared/idempotency/idempotent.decorator';
import { UpdateWorkerProfileDto, WorkerProfileResponse } from './dto/worker-profile.dto';
import { WorkersService } from './workers.service';

@ApiTags('workers')
@Controller('workers')
export class WorkersController {
  constructor(private readonly workers: WorkersService) {}

  /** `me` rather than an id in the path: a worker may only address themselves. */
  @Get('me')
  @Roles('worker')
  @ApiOperation({ summary: 'Fetch the signed-in worker profile' })
  @ApiOkResponse({ type: WorkerProfileResponse })
  async getMe(@CurrentPrincipal() principal: Principal): Promise<WorkerProfileResponse> {
    return this.workers.getProfile(principal.sub);
  }

  @Patch('me')
  @Roles('worker')
  @Idempotent()
  @ApiOperation({ summary: 'Create or update the signed-in worker profile' })
  @ApiOkResponse({ type: WorkerProfileResponse })
  async updateMe(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: UpdateWorkerProfileDto,
  ): Promise<WorkerProfileResponse> {
    return this.workers.updateProfile(principal.sub, dto);
  }
}
