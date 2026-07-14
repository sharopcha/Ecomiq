import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Trust exactly one hop (the gateway).
  // See the matching comment in identity-service's main.ts for the full
  // rationale (per-client ThrottlerGuard bucketing, IP spoofing risk of `true`).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // media-service has no Pulsar *consumer* connection yet — it is a pure
  // producer (PulsarModule in app.module.ts registers the outbox relay for
  // its own `media.file.*` events), same starting point as catalog-service
  // before crm's review.events subscription existed.

  const port = process.env.MEDIA_PORT || process.env.PORT || 3011;
  await app.listen(port);
  Logger.log(`🚀 media-service running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
