// apps/worker/src/main.ts
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  console.log('\n⚙️  NEXUS-HUB Worker started — processing queues...\n');
  // Worker runs indefinitely processing BullMQ jobs
}

bootstrap();
