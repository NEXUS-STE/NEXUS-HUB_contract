// apps/worker/src/processors/escrow.processor.ts
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { StellarService } from '../stellar/stellar.service';
import { QueueName, JobName, WebhookEvent } from '@nexus-hub/shared/enums';
import { Decimal } from '@prisma/client/runtime/library';
import { createHash } from 'crypto';

@Injectable()
@Processor(QueueName.ESCROW)
export class EscrowProcessor extends WorkerHost {
  private readonly logger = new Logger(EscrowProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    @InjectQueue(QueueName.WEBHOOK) private readonly webhookQueue: Queue,
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
      case JobName.APPROVE_RELEASE:
        return this.approveRelease(job.data);
      case JobName.COMPLETE_MILESTONE:
        return this.completeMilestone(job.data);
      case JobName.CLAIM_EXPIRED:
        return this.claimExpired(job.data);
      default:
        this.logger.warn(`Unknown job: ${job.name}`);
    }
  }

  // ─── FUND ────────────────────────────────────────────────────────────────

  private async fundEscrow(data: { escrowId: string; clientId: string; amount: string }) {
    const { escrowId, clientId, amount } = data;

    try {
      const [escrow, client, freelancer] = await Promise.all([
        this.prisma.escrow.findUnique({ where: { id: escrowId } }),
        this.prisma.user.findUnique({ where: { id: clientId } }),
        this.prisma.escrow.findUnique({ where: { id: escrowId } }).then((e) =>
          e ? this.prisma.user.findUnique({ where: { id: e.freelancerId } }) : null,
        ),
      ]);

      if (!escrow) throw new Error(`Escrow ${escrowId} not found`);
      if (!client?.stellarSecretEncrypted) throw new Error('Client has no Stellar key');
      if (!freelancer?.stellarPublicKey) throw new Error('Freelancer has no Stellar address');

      const clientSecret = this.stellar.decryptSecret(client.stellarSecretEncrypted);
      const amountStroops = BigInt(Math.round(parseFloat(amount) * 10_000_000));
      const milestoneHash = escrow.milestoneHash ?? createHash('sha256').update(escrowId).digest('hex');

      // init_escrow → fund in sequence (init first if no stellarContractId yet)
      if (!escrow.stellarContractId) {
        await this.stellar.initEscrow({
          escrowId,
          clientSecret,
          freelancerAddress: freelancer.stellarPublicKey,
          amount: amountStroops,
          milestoneHash,
          description: escrow.description,
          disputeDelay: 0,
          milestonesTotal: escrow.milestonesTotal,
          expiryLedger: escrow.expiryLedger,
        });
      }

      const txHash = await this.stellar.fundEscrow(escrowId, clientSecret);

      await this.prisma.$transaction(async (tx) => {
        await tx.escrow.update({
          where: { id: escrowId },
          data: {
            status: 'FUNDED',
            stellarContractId: this.stellar.adminPublicKey + '_' + escrowId, // contract address returned from init
            stellarTxHash: txHash,
            fundedAt: new Date(),
          },
        });

        await tx.transaction.updateMany({
          where: { escrowId, type: 'ESCROW_LOCK', status: 'PENDING' },
          data: { status: 'COMPLETED', reference: txHash },
        });

        await tx.auditLog.create({
          data: {
            userId: clientId,
            action: 'ESCROW_FUNDED',
            entity: 'Escrow',
            entityId: escrowId,
            newValues: { txHash, amount },
          },
        });
      });

      await this.fireWebhook(WebhookEvent.ESCROW_FUNDED, clientId, {
        escrowId,
        txHash,
        amount,
      });

      this.logger.log(`Escrow ${escrowId} funded — tx: ${txHash}`);
      return { escrowId, txHash };
    } catch (error) {
      await this.handleFundFailure(escrowId, clientId);
      throw error;
    }
  }

  private async handleFundFailure(escrowId: string, clientId: string) {
    await this.prisma.transaction.updateMany({
      where: { escrowId, type: 'ESCROW_LOCK', status: 'PENDING' },
      data: { status: 'FAILED' },
    });

    const escrow = await this.prisma.escrow.findUnique({ where: { id: escrowId } });
    if (escrow) {
      await this.prisma.$transaction([
        this.prisma.balance.update({
          where: { userId: clientId },
          data: {
            availableAmount: { increment: escrow.amount.add(escrow.fee) },
            reservedAmount: { decrement: escrow.amount },
          },
        }),
        this.prisma.escrow.update({
          where: { id: escrowId },
          data: { status: 'CANCELLED' },
        }),
      ]);
    }
  }

  // ─── RELEASE ─────────────────────────────────────────────────────────────

  private async releaseEscrow(data: { escrowId: string; clientId: string; feedback?: string }) {
    const { escrowId, clientId } = data;

    const [escrow, client] = await Promise.all([
      this.prisma.escrow.findUnique({ where: { id: escrowId } }),
      this.prisma.user.findUnique({ where: { id: clientId } }),
    ]);

    if (!escrow?.stellarContractId) throw new Error('No Stellar contract for this escrow');
    if (!client?.stellarSecretEncrypted) throw new Error('Client has no Stellar key');

    const clientSecret = this.stellar.decryptSecret(client.stellarSecretEncrypted);
    const milestoneHash = escrow.milestoneHash ?? createHash('sha256').update(escrowId).digest('hex');

    const txHash = await this.stellar.releaseEscrow(escrowId, clientSecret, milestoneHash);

    await this.prisma.$transaction(async (tx) => {
      await tx.escrow.update({
        where: { id: escrowId },
        data: { status: 'RELEASED', releasedAt: new Date(), stellarTxHash: txHash },
      });

      await tx.balance.update({
        where: { userId: escrow.freelancerId },
        data: { availableAmount: { increment: escrow.amount } },
      });

      await tx.balance.update({
        where: { userId: escrow.clientId },
        data: { reservedAmount: { decrement: escrow.amount } },
      });

      await tx.transaction.create({
        data: {
          idempotencyKey: `release-${escrowId}`,
          userId: escrow.freelancerId,
          type: 'ESCROW_RELEASE',
          status: 'COMPLETED',
          amount: escrow.amount,
          description: `Escrow released: ${escrow.description}`,
          reference: txHash,
          escrowId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: clientId,
          action: 'ESCROW_RELEASED',
          entity: 'Escrow',
          entityId: escrowId,
          newValues: { txHash },
        },
      });
    });

    await this.fireWebhook(WebhookEvent.ESCROW_RELEASED, escrow.freelancerId, {
      escrowId,
      freelancerId: escrow.freelancerId,
      amount: escrow.amount.toString(),
      txHash,
    });

    this.logger.log(`Escrow ${escrowId} released — tx: ${txHash}`);
    return { escrowId, txHash };
  }

  // ─── REFUND ──────────────────────────────────────────────────────────────

  private async refundEscrow(data: { escrowId: string; adminId: string; reason: string }) {
    const { escrowId, adminId, reason } = data;

    const escrow = await this.prisma.escrow.findUnique({ where: { id: escrowId } });
    if (!escrow?.stellarContractId) throw new Error('No Stellar contract for this escrow');

    const txHash = await this.stellar.refundEscrow(escrowId);

    await this.prisma.$transaction(async (tx) => {
      await tx.escrow.update({
        where: { id: escrowId },
        data: { status: 'REFUNDED', refundedAt: new Date(), stellarTxHash: txHash },
      });

      await tx.balance.update({
        where: { userId: escrow.clientId },
        data: {
          availableAmount: { increment: escrow.amount },
          reservedAmount: { decrement: escrow.amount },
        },
      });

      await tx.transaction.create({
        data: {
          idempotencyKey: `refund-${escrowId}`,
          userId: escrow.clientId,
          type: 'ESCROW_REFUND',
          status: 'COMPLETED',
          amount: escrow.amount,
          description: `Escrow refunded: ${reason}`,
          reference: txHash,
          escrowId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'ESCROW_REFUNDED',
          entity: 'Escrow',
          entityId: escrowId,
          newValues: { txHash, reason },
        },
      });
    });

    await this.fireWebhook(WebhookEvent.ESCROW_REFUNDED, escrow.clientId, {
      escrowId,
      clientId: escrow.clientId,
      amount: escrow.amount.toString(),
      txHash,
    });

    this.logger.log(`Escrow ${escrowId} refunded — tx: ${txHash}`);
    return { escrowId, txHash };
  }

  // ─── APPROVE RELEASE (2-of-2) ────────────────────────────────────────────

  private async approveRelease(data: { escrowId: string; approverId: string; role: 'CLIENT' | 'FREELANCER' }) {
    const { escrowId, approverId, role } = data;

    const [escrow, approver] = await Promise.all([
      this.prisma.escrow.findUnique({ where: { id: escrowId } }),
      this.prisma.user.findUnique({ where: { id: approverId } }),
    ]);

    if (!escrow?.stellarContractId) throw new Error('No Stellar contract for this escrow');
    if (!approver?.stellarSecretEncrypted) throw new Error('Approver has no Stellar key');

    const approverSecret = this.stellar.decryptSecret(approver.stellarSecretEncrypted);
    const txHash = await this.stellar.approveRelease(escrowId, approverSecret);

    // Read on-chain state to sync approval flags.
    const onChain = await this.stellar.getEscrowRecord(escrowId);
    const clientApproved = Boolean(onChain['client_approved']);
    const freelancerApproved = Boolean(onChain['freelancer_approved']);
    const bothApproved = clientApproved && freelancerApproved;

    await this.prisma.$transaction(async (tx) => {
      await tx.escrow.update({
        where: { id: escrowId },
        data: {
          clientApproved,
          freelancerApproved,
          ...(bothApproved ? { status: 'RELEASED', releasedAt: new Date(), stellarTxHash: txHash } : {}),
        },
      });

      if (bothApproved) {
        await tx.balance.update({
          where: { userId: escrow.freelancerId },
          data: { availableAmount: { increment: escrow.amount } },
        });
        await tx.balance.update({
          where: { userId: escrow.clientId },
          data: { reservedAmount: { decrement: escrow.amount } },
        });
        await tx.transaction.create({
          data: {
            idempotencyKey: `approve-release-${escrowId}`,
            userId: escrow.freelancerId,
            type: 'ESCROW_RELEASE',
            status: 'COMPLETED',
            amount: escrow.amount,
            description: `2-of-2 approved release: ${escrow.description}`,
            reference: txHash,
            escrowId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: approverId,
          action: 'APPROVE_RELEASE',
          entity: 'Escrow',
          entityId: escrowId,
          newValues: { role, clientApproved, freelancerApproved, txHash },
        },
      });
    });

    if (bothApproved) {
      await this.fireWebhook(WebhookEvent.ESCROW_RELEASED, escrow.freelancerId, {
        escrowId,
        freelancerId: escrow.freelancerId,
        amount: escrow.amount.toString(),
        txHash,
        via: '2-of-2',
      });
    }

    this.logger.log(`Approve-release recorded for ${escrowId} by ${role} — bothApproved=${bothApproved}`);
    return { escrowId, txHash, clientApproved, freelancerApproved };
  }

  // ─── COMPLETE MILESTONE ───────────────────────────────────────────────────

  private async completeMilestone(data: { escrowId: string; freelancerId: string }) {
    const { escrowId, freelancerId } = data;

    const [escrow, freelancer] = await Promise.all([
      this.prisma.escrow.findUnique({ where: { id: escrowId } }),
      this.prisma.user.findUnique({ where: { id: freelancerId } }),
    ]);

    if (!escrow?.stellarContractId) throw new Error('No Stellar contract for this escrow');
    if (!freelancer?.stellarSecretEncrypted) throw new Error('Freelancer has no Stellar key');

    const freelancerSecret = this.stellar.decryptSecret(freelancer.stellarSecretEncrypted);
    const txHash = await this.stellar.completeMilestone(escrowId, freelancerSecret);

    // Sync on-chain milestone counters.
    const onChain = await this.stellar.getEscrowRecord(escrowId);
    const milestonesCompleted = Number(onChain['milestones_completed'] ?? 0);
    const milestonesTotal = Number(onChain['milestones_total'] ?? escrow.milestonesTotal);

    await this.prisma.$transaction(async (tx) => {
      await tx.escrow.update({
        where: { id: escrowId },
        data: { milestonesCompleted },
      });

      await tx.auditLog.create({
        data: {
          userId: freelancerId,
          action: 'MILESTONE_COMPLETED',
          entity: 'Escrow',
          entityId: escrowId,
          newValues: { milestonesCompleted, milestonesTotal, txHash },
        },
      });
    });

    await this.fireWebhook(WebhookEvent.MILESTONE_COMPLETED, escrow.clientId, {
      escrowId,
      milestonesCompleted,
      milestonesTotal,
      txHash,
    });

    this.logger.log(`Milestone ${milestonesCompleted}/${milestonesTotal} for escrow ${escrowId}`);
    return { escrowId, txHash, milestonesCompleted, milestonesTotal };
  }

  // ─── CLAIM EXPIRED ────────────────────────────────────────────────────────

  private async claimExpired(data: { escrowId: string; triggeredBy?: string }) {
    const { escrowId, triggeredBy } = data;

    const escrow = await this.prisma.escrow.findUnique({ where: { id: escrowId } });
    if (!escrow?.stellarContractId) throw new Error('No Stellar contract for this escrow');

    const txHash = await this.stellar.claimExpired(escrowId);

    await this.prisma.$transaction(async (tx) => {
      await tx.escrow.update({
        where: { id: escrowId },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
          expiredAt: new Date(),
          stellarTxHash: txHash,
        },
      });

      await tx.balance.update({
        where: { userId: escrow.clientId },
        data: {
          availableAmount: { increment: escrow.amount },
          reservedAmount: { decrement: escrow.amount },
        },
      });

      await tx.transaction.create({
        data: {
          idempotencyKey: `expired-${escrowId}`,
          userId: escrow.clientId,
          type: 'ESCROW_REFUND',
          status: 'COMPLETED',
          amount: escrow.amount,
          description: `Escrow expired and reclaimed: ${escrow.description}`,
          reference: txHash,
          escrowId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: triggeredBy ?? null,
          action: 'ESCROW_EXPIRED',
          entity: 'Escrow',
          entityId: escrowId,
          newValues: { txHash, triggeredBy },
        },
      });
    });

    await this.fireWebhook(WebhookEvent.ESCROW_EXPIRED, escrow.clientId, {
      escrowId,
      clientId: escrow.clientId,
      amount: escrow.amount.toString(),
      txHash,
    });

    this.logger.log(`Escrow ${escrowId} expired and refunded — tx: ${txHash}`);
    return { escrowId, txHash };
  }

  // ─── Webhook helper ───────────────────────────────────────────────────────

  private async fireWebhook(event: WebhookEvent, userId: string, payload: Record<string, unknown>) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { userId, isActive: true, events: { has: event } },
    });

    for (const endpoint of endpoints) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          endpointId: endpoint.id,
          event,
          payload,
          status: 'PENDING',
        },
      });

      await this.webhookQueue.add(
        JobName.DELIVER_WEBHOOK,
        {
          deliveryId: delivery.id,
          url: endpoint.url,
          secret: endpoint.secret,
          event,
          payload,
        },
        { attempts: 5, backoff: { type: 'exponential', delay: 10_000 } },
      );
    }
  }
}
