import { Module } from '@nestjs/common';

/**
 * profile, availability, documents, vetting (TRD §4).
 *
 * To build: get/update profile, availability template, travel distance, role
 * preferences; ops vetting transitions; WorkerDocument only under Register #4
 * branch B, gated by the DOCUMENT_UPLOAD flag.
 */
@Module({})
export class WorkersModule {}
