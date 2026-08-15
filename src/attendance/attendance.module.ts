import { Module } from '@nestjs/common';

import { BookingsModule } from '../bookings/bookings.module';
import { AttendanceService } from './attendance.service';
import { AttendancePipelineService } from './pipeline/attendance-pipeline.service';
import {
  AccuracyStage,
  BookingEligibilityStage,
  FaceVerificationStage,
  GeofenceStage,
  IntegrityStage,
  MediaStage,
  ShiftCodeStage,
  TimeArbitrationStage,
  WindowStage,
} from './pipeline/stages';

@Module({
  imports: [BookingsModule],
  providers: [
    AttendanceService,
    AttendancePipelineService,
    BookingEligibilityStage,
    MediaStage,
    TimeArbitrationStage,
    WindowStage,
    AccuracyStage,
    GeofenceStage,
    IntegrityStage,
    FaceVerificationStage,
    ShiftCodeStage,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
