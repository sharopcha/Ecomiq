import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app/app.module';

async function bootstrap() {
  // bodyParser: false. The proxy controllers
  // used to re-serialize with JSON.stringify(req.body), which corrupts
  // multipart/urlencoded/binary payloads (product image uploads were
  // broken through the gateway). Instead we buffer every request body as a
  // raw Buffer (below) and forward it verbatim upstream.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  app.use(helmet());
  app.use(cookieParser());
  // type: () => true — buffer the body for every content type, not just
  // application/json. Safe to apply globally: the gateway has no JSON
  // routes of its own that need parsing (health is GET-only) — re-check
  // this if a gateway-local POST route is ever added.
  app.use(
    express.raw({
      type: () => true,
      limit: process.env.PROXY_BODY_LIMIT ?? '25mb',
    }),
  );
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

  const port = process.env.GATEWAY_PORT || process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`🚀 api-gateway running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
