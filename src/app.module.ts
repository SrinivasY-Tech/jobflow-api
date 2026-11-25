import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvConfig, validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.config';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { WorkstationsModule } from './workstations/workstations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Env comes from the process (docker compose, CI, or `node --env-file=.env`).
      // Not reading .env here keeps exactly one way of loading config.
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) =>
        buildDataSourceOptions({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          PORT: config.get('PORT', { infer: true }),
          DB_HOST: config.get('DB_HOST', { infer: true }),
          DB_PORT: config.get('DB_PORT', { infer: true }),
          DB_USER: config.get('DB_USER', { infer: true }),
          DB_PASSWORD: config.get('DB_PASSWORD', { infer: true }),
          DB_NAME: config.get('DB_NAME', { infer: true }),
        }),
    }),
    HealthModule,
    WorkstationsModule,
    JobsModule,
  ],
})
export class AppModule {}
