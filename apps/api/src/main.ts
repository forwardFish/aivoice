import 'reflect-metadata';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
if (process.env.NODE_ENV !== 'production') {
  config({ path: path.join(projectRoot, '.env.local'), quiet: true });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  const port = Number(process.env.PORT || 8787);
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
