// apps/api/src/escrow/escrow.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EscrowController } from './escrow.controller';
import { EscrowService } from './escrow.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { QueueName } from '@nexus-hub/shared/enums';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QueueName.ESCROW },
      { name: QueueName.WEBHOOK },
    ),
    PrismaModule,
  ],
  controllers: [EscrowController],
  providers: [EscrowService],
  exports: [EscrowService],
})
export class EscrowModule {}
