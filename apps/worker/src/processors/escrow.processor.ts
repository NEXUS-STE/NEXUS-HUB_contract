// apps/worker/src/processors/escrow.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { QueueName, JobName } from '@nexus-hub/shared/enums';

@Injectable()
@Processor(QueueName.ESCROW)
export class EscrowProcessor extends WorkerHost {
  private readonly logger = new Logger(EscrowProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job) {
    this.logger.log(`Processing job: ${job.name} [${job.id}]`);

    switch (job.name) {
      case JobName.FUND_ESCROW:
        return this.fundEscrow(job.data);
      case JobName.RELEASE_ESCROW:
        return this.releaseEscrow(job.data);
      case JobName.REFUND_ESCROW:
        return this.refundEscrow(job.data);
      default:
        this.logger.warn(`Unknown job: ${job.name}`);
    }
  }

  private async fundEscrow(data: { escrowId: string; clientId: string; amount: string }) {
    const { escrowId, amount } = data;

    try {
      // Call Trustless Work API to create Stellar escrow contract
      const twApiUrl = this.config.get<string>('TRUSTLESS_WORK_API_URL');
      const twApiKey = this.config.get<string>('TRUSTLESS_WORK_API_KEY');

      const response = await fetch(`${twApiUrl}/escrow/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${twApiKey}`,
        },
        body: JSON.stringify({ escrowId, amount, currency: 'USDC' }),
      });

      if (!response.ok) {
        throw new Error(`Trustless Work API error: ${response.status}`);
      }

      const { contractId, txHash } = await response.json() as { contractId: string; txHash: string };

      await this.prisma.$transaction(async (tx) => {
        await tx.escrow.update({
          where: { id: escrowId },
          data: {
            status: 'FUNDED',
            stellarContractId: contractId,
            stellarTxHash: txHash,
            fundedAt: new Date(),
          },
        });

        await tx.transaction.updateMany({
          where: { escrowId, type: 'ESCROW_LOCK', status: 'PENDING' },
          data: { status: 'COMPLETED', reference: txHash },
        });
      });

      this.logger.log(`Escrow ${escrowId} funded → Stellar contract: ${contractId}`);
      return { escrowId, contractId, txHash };
    } catch (error) {
      // Mark transaction as failed
      await this.prisma.transaction.updateMany({
        where: { escrowId, type: 'ESCROW_LOCK', status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      // Unblock balance
      const escrow = await this.prisma.escrow.findUnique({ where: { id: escrowId } });
      if (escrow) {
        await this.prisma.balance.update({
          where: { userId: escrow.clientId },
          data: {
            availableAmount: { increment: escrow.amount },
            reservedAmount: { decrement: escrow.amount },
          },
        });
        await this.prisma.escrow.update({ where: { id: escrowId }, data: { status: 'CANCELLED' } });
      }
      throw error; // Re-throw for BullMQ retry
    }
  }

  private async releaseEscrow(data: { escrowId: string; clientId: string; feedback?: string }) {
    const { escrowId } = data;
    const escrow = await this.prisma.escrow.findUnique({ where: { id: escrowId } });
    if (!escrow?.stellarContractId) throw new Error('No Stellar contract found');

    const twApiUrl = this.config.get<string>('TRUSTLESS_WORK_API_URL');
    const twApiKey = this.config.get<string>('TRUSTLESS_WORK_API_KEY');

    const response = await fetch(`${twApiUrl}/escrow/${escrow.stellarContractId}/release`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${twApiKey}` },
    });

    if (!response.ok) throw new Error(`Trustless Work release error: ${response.status}`);

    const { txHash } = await response.json() as { txHash: string };

    await this.prisma.$transaction(async (tx) => {
      await tx.escrow.update({
        where: { id: escrowId },
        data: { status: 'RELEASED', releasedAt: new Date(), stellarTxHash: txHash },
      });

      // Credit freelancer balance
      await tx.balance.update({
        where: { userId: escrow.freelancerId },
        data: { availableAmount: { increment: escrow.amount } },
      });

      // Decrement client reserved
      await tx.balance.update({
        where: { userId: escrow.clientId },
        data: { reservedAmount: { decrement: escrow.amount } },
      });

      await tx.transaction.create({
        data: {
          idempotencyKey: `release-${escrowId}-${Date.now()}`,
          userId: escrow.freelancerId,
          type: 'ESCROW_RELEASE',
          status: 'COMPLETED',
          amount: escrow.amount,
          description: `Escrow released: ${escrow.description}`,
          reference: txHash,
          escrowId,
        },
      });
    });

    this.logger.log(`Escrow ${escrowId} released to freelancer ${escrow.freelancerId}`);
    return { escrowId, txHash };
  }

  private async refundEscrow(data: { escrowId: string; adminId: string; reason: string }) {
    const { escrowId } = data;
    const escrow = await this.prisma.escrow.findUnique({ where: { id: escrowId } });
    if (!escrow?.stellarContractId) throw new Error('No Stellar contract found');

    const twApiUrl = this.config.get<string>('TRUSTLESS_WORK_API_URL');
    const twApiKey = this.config.get<string>('TRUSTLESS_WORK_API_KEY');

    const response = await fetch(`${twApiUrl}/escrow/${escrow.stellarContractId}/refund`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${twApiKey}` },
    });

    if (!response.ok) throw new Error(`Trustless Work refund error: ${response.status}`);
    const { txHash } = await response.json() as { txHash: string };

    await this.prisma.$transaction(async (tx) => {
      await tx.escrow.update({
        where: { id: escrowId },
        data: { status: 'REFUNDED', refundedAt: new Date(), stellarTxHash: txHash },
      });

      // Restore client available balance
      await tx.balance.update({
        where: { userId: escrow.clientId },
        data: {
          availableAmount: { increment: escrow.amount },
          reservedAmount: { decrement: escrow.amount },
        },
      });

      await tx.transaction.create({
        data: {
          idempotencyKey: `refund-${escrowId}-${Date.now()}`,
          userId: escrow.clientId,
          type: 'ESCROW_REFUND',
          status: 'COMPLETED',
          amount: escrow.amount,
          description: `Escrow refunded: ${data.reason}`,
          reference: txHash,
          escrowId,
        },
      });
    });

    this.logger.log(`Escrow ${escrowId} refunded to client ${escrow.clientId}`);
    return { escrowId, txHash };
  }
}
