import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { OTP_SENDER, OtpSender } from '../src/auth/otp-sender';
import { PrismaService } from '../src/prisma/prisma.service';

/** Captures the code instead of sending it, so the test can complete the login. */
class CapturingOtpSender implements OtpSender {
  readonly sent: { phone: string; code: string }[] = [];

  send(phone: string, code: string): Promise<void> {
    this.sent.push({ phone, code });
    return Promise.resolve();
  }

  lastCodeFor(phone: string): string {
    const entry = [...this.sent].reverse().find((s) => s.phone === phone);
    if (!entry) throw new Error(`No OTP was sent to ${phone}`);
    return entry.code;
  }
}

describe('Worker login and profile (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  const sender = new CapturingOtpSender();

  // Unique per run so repeated runs do not collide on the phone unique index.
  const phone = `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const deviceId = `device-${randomUUID()}`;

  const server = () => app.getHttpServer();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_SENDER)
      .useValue(sender)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      const worker = await prisma.worker.findUnique({ where: { phone } });
      if (worker) await prisma.worker.delete({ where: { id: worker.id } });
      await prisma.otpChallenge.deleteMany({ where: { phone } });
    }
    await app?.close();
  });

  describe('the API is closed by default', () => {
    it('refuses an unauthenticated profile read', async () => {
      const response = await request(server()).get('/v1/workers/me').expect(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('refuses config without a session', async () => {
      await request(server()).get('/v1/config').expect(401);
    });

    it('still serves health, which is explicitly public', async () => {
      await request(server()).get('/v1/healthz').expect(200);
    });
  });

  describe('signing in', () => {
    let accessToken: string;
    let refreshToken: string;

    it('rejects a phone number that is not E.164', async () => {
      await request(server())
        .post('/v1/auth/otp/request')
        .send({ phone: '9876543210' })
        .expect(400);
    });

    it('sends a code without ever returning it', async () => {
      const response = await request(server())
        .post('/v1/auth/otp/request')
        .send({ phone })
        .expect(201);

      expect(response.body).toHaveProperty('expiresInSeconds');
      expect(JSON.stringify(response.body)).not.toContain(sender.lastCodeFor(phone));
    });

    it('rejects the wrong code', async () => {
      const wrong = sender.lastCodeFor(phone) === '000000' ? '111111' : '000000';
      const response = await request(server())
        .post('/v1/auth/otp/verify')
        .send({ phone, code: wrong, deviceId })
        .expect(422);

      expect(response.body).toMatchObject({ code: 'INVALID_CODE' });
    });

    it('creates the worker on first successful verification', async () => {
      const response = await request(server())
        .post('/v1/auth/otp/verify')
        .send({ phone, code: sender.lastCodeFor(phone), deviceId })
        .expect(201);

      const body = response.body as {
        accessToken: string;
        refreshToken: string;
        isNewWorker: boolean;
        profileComplete: boolean;
        status: string;
      };

      expect(body.isNewWorker).toBe(true);
      expect(body.profileComplete).toBe(false);
      expect(body.status).toBe('PENDING_VETTING');

      accessToken = body.accessToken;
      refreshToken = body.refreshToken;
    });

    it('will not accept the same code twice', async () => {
      await request(server())
        .post('/v1/auth/otp/verify')
        .send({ phone, code: sender.lastCodeFor(phone), deviceId })
        .expect(422);
    });

    it('now allows the profile read that was refused before', async () => {
      const response = await request(server())
        .get('/v1/workers/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({ phone, name: null, profileComplete: false });
    });

    it('rotates the refresh token and refuses the old one afterwards', async () => {
      const rotated = await request(server())
        .post('/v1/auth/refresh')
        .send({ refreshToken, deviceId })
        .expect(201);

      const next = (rotated.body as { refreshToken: string }).refreshToken;
      expect(next).not.toBe(refreshToken);

      // Replaying the consumed token is treated as a leak: the family dies.
      const replay = await request(server())
        .post('/v1/auth/refresh')
        .send({ refreshToken, deviceId })
        .expect(401);
      expect(replay.body).toMatchObject({ code: 'SESSION_SUPERSEDED' });

      // ...including the token that was legitimately issued moments ago.
      await request(server())
        .post('/v1/auth/refresh')
        .send({ refreshToken: next, deviceId })
        .expect(401);
    });
  });

  describe('creating the profile', () => {
    let accessToken: string;

    beforeAll(async () => {
      await request(server()).post('/v1/auth/otp/request').send({ phone });
      const login = await request(server())
        .post('/v1/auth/otp/verify')
        .send({ phone, code: sender.lastCodeFor(phone), deviceId });
      accessToken = (login.body as { accessToken: string }).accessToken;
    });

    const patch = (body: object, key = randomUUID()) =>
      request(server())
        .patch('/v1/workers/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', key)
        .send(body);

    it('requires an Idempotency-Key on the write', async () => {
      await request(server())
        .patch('/v1/workers/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Priya' })
        .expect(400);
    });

    it('saves the first step without demanding the rest', async () => {
      const response = await patch({ name: 'Priya Raman', languagePref: 'ta' }).expect(200);
      expect(response.body).toMatchObject({
        name: 'Priya Raman',
        languagePref: 'ta',
        profileComplete: false,
      });
    });

    it('keeps the first step when the second is saved', async () => {
      const response = await patch({
        roles: ['housekeeping', 'kitchen_help'],
        homeLat: 12.9352,
        homeLng: 77.6245,
        homeAreaLabel: 'Koramangala, Bengaluru',
        travelDistanceKm: 12,
      }).expect(200);

      expect(response.body).toMatchObject({
        name: 'Priya Raman',
        languagePref: 'ta',
        roles: ['housekeeping', 'kitchen_help'],
        profileComplete: true,
      });
    });

    it('refuses half a home area', async () => {
      await patch({ homeLat: 12.9 }).expect(400);
    });

    it('refuses an unknown field rather than ignoring it', async () => {
      await patch({ status: 'VETTED' }).expect(400);
    });

    it('replays a repeated write instead of applying it twice', async () => {
      const key = randomUUID();
      const first = await patch({ travelDistanceKm: 25 }, key).expect(200);
      const second = await patch({ travelDistanceKm: 25 }, key).expect(200);

      expect(second.headers['idempotent-replay']).toBe('true');
      expect(second.body).toEqual(first.body);
    });

    it('rejects a reused key carrying a different body', async () => {
      const key = randomUUID();
      await patch({ travelDistanceKm: 30 }, key).expect(200);
      const conflict = await patch({ travelDistanceKm: 31 }, key).expect(409);
      expect(conflict.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    });
  });
});
