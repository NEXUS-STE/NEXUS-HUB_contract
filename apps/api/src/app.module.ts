// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BalancesModule } from './balances/balances.module';
import { TopupsModule } from './topups/topups.module';
import { EscrowModule } from './escrow/escrow.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { DisputesModule } from './disputes/disputes.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL', 60),
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),

    // Queue
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),

    // Core
    PrismaModule,

    // Feature Modules
    AuthModule,
    UsersModule,
    BalancesModule,
    TopupsModule,
    EscrowModule,
    WithdrawalsModule,
    DisputesModule,
    WebhooksModule,
  ],
})
export class AppModule {}
