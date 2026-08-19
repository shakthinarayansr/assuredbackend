import { Injectable, Logger } from '@nestjs/common';

export const OTP_SENDER = 'OTP_SENDER';

/**
 * Every provider sits behind an interface so it is swappable by configuration
 * (TRD §11). MSG91 is the intended implementation; it needs credentials that
 * are not yet issued.
 */
export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

/**
 * Development sender. Writes the code to the log instead of spending an SMS.
 *
 * Deliberately refuses to run in production: a silent no-op sender there would
 * lock every worker out of the platform with no visible failure.
 */
@Injectable()
export class LoggingOtpSender implements OtpSender {
  private readonly logger = new Logger(LoggingOtpSender.name);

  send(phone: string, code: string): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('LoggingOtpSender must never be used in production — configure MSG91');
    }

    // The last four digits are enough to tell two test handsets apart without
    // writing a full phone number to the log (TRD §13).
    this.logger.log(`OTP for ...${phone.slice(-4)} is ${code}`);
    return Promise.resolve();
  }
}
