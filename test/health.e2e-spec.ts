import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

describe('Health (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // Same configuration the shipped app uses — never a bespoke test setup, or
    // the suite validates an application that does not exist in production.
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    // Guarded: if beforeAll threw, `app` is undefined and an unguarded close()
    // buries the real failure under a TypeError.
    await app?.close();
  });

  it('serves liveness at the versioned path', async () => {
    await request(app.getHttpServer()).get('/v1/healthz').expect(200).expect({ status: 'ok' });
  });

  it('reports readiness once the database answers', async () => {
    await request(app.getHttpServer())
      .get('/v1/readyz')
      .expect(200)
      .expect({ status: 'ok', database: 'ok' });
  });

  it('requires a session for config, which is not public', async () => {
    await request(app.getHttpServer()).get('/v1/config').expect(401);
  });

  it('returns a machine code, not a bare 404, for an unknown route', async () => {
    const response = await request(app.getHttpServer()).get('/v1/does-not-exist').expect(404);

    expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('does not mount anything at the doubled prefix', async () => {
    await request(app.getHttpServer()).get('/v1/v1/healthz').expect(404);
  });
});
