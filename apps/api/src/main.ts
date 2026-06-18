// apps/api/src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // Security
  app.use(helmet());
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  });

  // Versioning
  app.enableVersioning({ type: VersioningType.URI });
  app.setGlobalPrefix('api');

  // Global Pipes, Filters, Interceptors
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());

  // Swagger Docs
  const config = new DocumentBuilder()
    .setTitle('NEXUS-HUB API')
    .setDescription(
      'Trustless Payments Orchestration for Marketplaces — Auth, Balances, Escrow, Disputes & Webhooks',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT',
    )
    .addTag('Auth', 'Authentication & token management')
    .addTag('Users', 'User management')
    .addTag('Balances', 'Balance enquiry & history')
    .addTag('Top-ups', 'Fund wallet via Airtm')
    .addTag('Escrow', 'Trustless Work escrow management')
    .addTag('Withdrawals', 'Withdraw to Airtm')
    .addTag('Disputes', 'Dispute resolution')
    .addTag('Webhooks', 'Webhook endpoint management')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.APP_PORT || 4000;
  await app.listen(port);
  console.log(`\n🚀 NEXUS-HUB API running on: http://localhost:${port}`);
  console.log(`📚 Swagger Docs:               http://localhost:${port}/api/docs\n`);
}

bootstrap();
