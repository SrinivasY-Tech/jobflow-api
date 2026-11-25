import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './app.setup';
import { EnvConfig } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  setupSwagger(app); // UI at /docs, raw spec at /docs-json
  // Lets TypeORM close the pg pool cleanly on SIGTERM (e.g. `docker compose stop`).
  app.enableShutdownHooks();

  const config: ConfigService<EnvConfig, true> = app.get(ConfigService);
  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  Logger.log(`jobflow-api listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
