import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, genReqId: () => crypto.randomUUID() }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  configureApp(app);

  // The OpenAPI spec is the contract of record; the Flutter client is generated from it.
  const openApiConfig = new DocumentBuilder()
    .setTitle('AssuredGig Platform API')
    .setDescription('Worker and ops surfaces. Contract of record for the Flutter client.')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('workers')
    .addTag('bookings')
    .addTag('attendance')
    .addTag('ops')
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/openapi.json' });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
}

void bootstrap();
