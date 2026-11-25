import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PgErrorFilter } from './common/filters/pg-error.filter';

/**
 * Global app wiring, shared by main.ts and the e2e tests so the tests run
 * against exactly the same pipes/filters as production.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties that have no validation decorator
      forbidNonWhitelisted: true, // ...and reject the request if any were sent
      transform: true, // turn plain JSON into DTO class instances
      // enableImplicitConversion is deliberately OFF: it converts the query
      // string "false" to boolean true. Query DTOs use explicit @Type() instead.
    }),
  );
  app.useGlobalFilters(new PgErrorFilter());
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('jobflow-api')
    .setDescription('Learning project: concurrency-safe job assignment with NestJS + PostgreSQL')
    .setVersion('0.1.0')
    .addBearerAuth() // "Authorize" button: paste the accessToken from POST /auth/login
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
}
