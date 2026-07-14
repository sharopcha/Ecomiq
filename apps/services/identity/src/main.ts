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

  // The gateway is the sole reverse proxy in front of this service, so
  // trust exactly one hop: Express then reads the
  // real client IP from the *last* entry of `x-forwarded-for` (which the
  // gateway now sets/appends, see api-gateway's service-proxy.util.ts)
  // instead of seeing every request as the gateway's own IP. `req.ip`
  // downstream (e.g. ThrottlerGuard's per-client bucketing) becomes correct.
  // `1`, not `true` — `true` would trust the whole `x-forwarded-for` chain,
  // letting a client spoof its own IP by sending the header itself.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.APP_WEB_URL ?? 'http://localhost:4200',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.IDENTITY_PORT || process.env.PORT || 3001;
  await app.listen(port);
  Logger.log(
    `🚀 identity-service running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
