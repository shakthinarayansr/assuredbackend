import { Injectable } from '@nestjs/common';
import { Prisma, Worker } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../shared/errors/app.exception';
import { ErrorCode } from '../shared/errors/error-codes';
import { UpdateWorkerProfileDto, WorkerProfileResponse } from './dto/worker-profile.dto';
import { isProfileComplete, missingProfileFields } from './profile-completeness';

@Injectable()
export class WorkersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(workerId: string): Promise<WorkerProfileResponse> {
    const worker = await this.prisma.worker.findUnique({ where: { id: workerId } });
    if (!worker) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Worker not found');
    }
    return this.toResponse(worker);
  }

  /**
   * Partial update. Only the keys the client sent are written, so a two-step
   * profile flow cannot blank out what the first step saved.
   *
   * The worker id comes from the access token, never from the request body —
   * ownership is not a field a client gets to supply (TRD §13).
   */
  async updateProfile(
    workerId: string,
    dto: UpdateWorkerProfileDto,
  ): Promise<WorkerProfileResponse> {
    const data: Prisma.WorkerUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.languagePref !== undefined) data.languagePref = dto.languagePref;
    if (dto.roles !== undefined) data.roles = dto.roles;
    if (dto.homeLat !== undefined) data.homeLat = dto.homeLat;
    if (dto.homeLng !== undefined) data.homeLng = dto.homeLng;
    if (dto.homeAreaLabel !== undefined) data.homeAreaLabel = dto.homeAreaLabel;
    if (dto.travelDistanceKm !== undefined) data.travelDistanceKm = dto.travelDistanceKm;
    if (dto.profilePhotoKey !== undefined) data.profilePhotoKey = dto.profilePhotoKey;
    if (dto.availability !== undefined) {
      data.availability = dto.availability as unknown as Prisma.InputJsonValue;
    }

    // A home area is a coordinate pair or nothing; half of one would silently
    // break every distance calculation that reads it.
    const lat = dto.homeLat ?? undefined;
    const lng = dto.homeLng ?? undefined;
    if ((lat === undefined) !== (lng === undefined)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'homeLat and homeLng must be provided together',
      );
    }

    const worker = await this.prisma.worker.update({ where: { id: workerId }, data });
    return this.toResponse(worker);
  }

  private toResponse(worker: Worker): WorkerProfileResponse {
    return {
      id: worker.id,
      phone: worker.phone,
      name: worker.name,
      status: worker.status,
      languagePref: worker.languagePref,
      roles: worker.roles,
      homeAreaLabel: worker.homeAreaLabel,
      homeLat: worker.homeLat,
      homeLng: worker.homeLng,
      travelDistanceKm: worker.travelDistanceKm,
      availability: worker.availability,
      profilePhotoKey: worker.profilePhotoKey,
      profileComplete: isProfileComplete(worker),
      missingFields: missingProfileFields(worker),
    };
  }
}
