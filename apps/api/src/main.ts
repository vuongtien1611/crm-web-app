import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, Logger } from '@nestjs/common';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
      trustProxy: true,
    }),
  );

  // Enable graceful shutdown handling for SIGTERM/SIGINT from Cloud Run / Docker
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3000);
  const isProduction = process.env.NODE_ENV === 'production';
  const frontendUrl = isProduction
    ? process.env.FRONTEND_URL
    : configService.get<string>('frontendUrl', 'http://localhost:5173');
  const jwtRefreshSecret = configService.get<string>('jwt.refreshSecret', 'default_refresh_secret');

  await app.register(fastifyCookie, {
    secret: jwtRefreshSecret,
  });

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 1,
    },
    throwFileSizeLimit: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const allowedOrigins = new Set<string>();
  const addConfiguredOrigin = (value: string) => {
    try {
      const parsed = new URL(value.trim());
      const hostname = parsed.hostname.toLowerCase();
      const isLoopback =
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname === '::1' ||
        hostname === '[::1]' ||
        /^127\./.test(hostname);
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        parsed.origin !== 'null' &&
        (!isProduction || !isLoopback)
      ) {
        allowedOrigins.add(parsed.origin);
      }
    } catch {
      // Ignore malformed origin configuration.
    }
  };

  if (frontendUrl) addConfiguredOrigin(frontendUrl);
  if (process.env.CORS_ORIGIN) {
    process.env.CORS_ORIGIN.split(',').forEach(addConfiguredOrigin);
  }
  if (!isProduction) {
    allowedOrigins.add('http://localhost:5173');
    allowedOrigins.add('http://localhost:3000');
  }

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      if (!isProduction && (
        origin.endsWith('.trycloudflare.com') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      )) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'x-custom-header'],
  });

  app.setGlobalPrefix('api');

  const logger = new Logger('Bootstrap');
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 NestJS Fastify CRM API running on http://0.0.0.0:${port}`);
}

bootstrap();
