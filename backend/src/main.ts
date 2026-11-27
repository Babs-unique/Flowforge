import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  const config = app.get(ConfigService);
  const rawOrigins = config.getOrThrow<string | string[]>('CORS_ORIGINS');

  const originsArray = Array.isArray(rawOrigins)
    ? rawOrigins
    : rawOrigins.split(',');

  const allowedOrigins = originsArray
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  app.use(cookieParser());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
}
await bootstrap();
