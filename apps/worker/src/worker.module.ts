// apps/worker/src/worker.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaService } from './common/prisma/prisma.service';
import { StellarService } from './stellar/stellar.service';
import { EscrowProcessor } from './processors/escrow.processor';
import { WebhookProcessor } from './processors/webhook.processor';
import { QueueName } from '@nexus-hub/shared/enums';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),

    BullModule.registerQueue(
      { name: QueueName.ESCROW },
      { name: QueueName.WEBHOOK },
      { name: QueueName.TOPUP },
      { name: QueueName.WITHDRAWAL },
    ),
  ],
  providers: [PrismaService, StellarService, EscrowProcessor, WebhookProcessor],
})
export class WorkerModule {}
