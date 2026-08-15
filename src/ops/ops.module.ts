import { Module } from '@nestjs/common';

/**
 * console endpoints, metrics (TRD §4, §6.4).
 *
 * To build: worker list and vetting, requirement CRUD, shortlist candidates,
 * distribute offers, booking detail with the full audit trail, live attendance
 * board, trigger replacement, dispute queue and resolution, config and flag
 * management, metrics. Every endpoint here is role-guarded to `ops`.
 */
@Module({})
export class OpsModule {}
