import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

/**
 * Dedicated Background Worker Process for Cloud Run Worker Service.
 * Runs BullMQ Workers (NotificationWorker, ReminderWorker, MaintenanceWorker)
 * and exposes lightweight health checks on PORT for Cloud Run container lifecycle.
 */
async function bootstrapWorker() {
  process.env.WORKER_MODE = 'true';

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
      trustProxy: true,
    }),
  );

  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 8080);

  app.setGlobalPrefix('api');

  await app.listen(port, '0.0.0.0');
  console.log(`⚙️ NestJS CRM Background Worker running on http://0.0.0.0:${port}`);
}

bootstrapWorker().catch((err) => {
  console.error('❌ Failed to start background worker:', err);
  process.exit(1);
});
