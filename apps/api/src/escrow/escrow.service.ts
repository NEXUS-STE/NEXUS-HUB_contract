// apps/api/src/escrow/escrow.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateEscrowDto } from './dto/create-escrow.dto';
import { ReleaseEscrowDto } from './dto/release-escrow.dto';
import { RefundEscrowDto } from './dto/refund-escrow.dto';
import { JobName, QueueName } from '@nexus-hub/shared/enums';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QueueName.ESCROW) private readonly escrowQueue: Queue,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────

  async createEscrow(clientId: string, dto: CreateEscrowDto, idempotencyKey: string) {
    const existing = await this.prisma.transaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const amount = new Decimal(dto.amount);
    const fee = amount.mul(0.01);
    const totalDebit = amount.add(fee);

    return this.prisma.$transaction(async (tx) => {
      const freelancer = await tx.user.findUnique({ where: { id: dto.freelancerId } });
      if (!freelancer) throw new NotFoundException('Freelancer not found');
      if (freelancer.role !== 'FREELANCER') throw new BadRequestException('Target user is not a freelancer');
      if (!freelancer.stellarPublicKey) throw new BadRequestException('Freelancer has no Stellar address on file');

      const balance = await tx.balance.findUnique({ where: { userId: clientId } });
      if (!balance || new Decimal(balance.availableAmount).lt(totalDebit)) {
        throw new BadRequestException('Insufficient balance. Please top up first.');
      }

      // Optimistic lock on balance
      const updated = await tx.balance.updateMany({
        where: { userId: clientId, version: balance.version },
        data: {
          availableAmount: { decrement: totalDebit },
          reservedAmount: { increment: amount },
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw new BadRequestException('Balance modified concurrently. Please retry.');

      const escrow = await tx.escrow.create({
        data: {
          clientId,
          freelancerId: dto.freelancerId,
          amount,
          fee,
          description: dto.description,
          milestoneTitle: dto.milestoneTitle,
          milestoneHash: dto.milestoneHash,
          milestonesTotal: dto.milestonesTotal ?? 0,
          expiryLedger: dto.expiryLedger ?? 0,
          status: 'PENDING',
        },
      });

      await tx.transaction.create({
        data: {
          idempotencyKey,
          userId: clientId,
          type: 'ESCROW_LOCK',
          status: 'PENDING',
          amount: totalDebit,
          fee,
          description: `Escrow created: ${dto.description}`,
          escrowId: escrow.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: clientId,
          action: 'ESCROW_CREATED',
          entity: 'Escrow',
          entityId: escrow.id,
          newValues: { amount: amount.toString(), freelancerId: dto.freelancerId },
        },
      });

      await this.escrowQueue.add(
        JobName.FUND_ESCROW,
        { escrowId: escrow.id, clientId, amount: amount.toFixed(7) },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );

      this.logger.log(`Escrow ${escrow.id} created — queued for Stellar funding`);
      return escrow;
    });
  }

  // ─── Release ─────────────────────────────────────────────────────────────

  async releaseEscrow(clientId: string, escrowId: string, dto: ReleaseEscrowDto) {
    const escrow = await this.prisma.escrow.findUnique({ where: { id: escrowId } });
    if (!escrow) throw new NotFoundException('Escrow not found');
    if (escrow.clientId !== clientId) throw new ForbiddenException('Not your escrow');
    if (!['FUNDED', 'ACTIVE'].includes(escrow.status)) {
      throw new BadRequestException(`Cannot release escrow in status: ${escrow.status}`);
    }

    await this.escrowQueue.add(
      JobName.RELEASE_ESCROW,
      { escrowId, clientId, feedback: dto.feedback },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    return { message: 'Release initiated. Funds will be transferred to the freelancer.' };
  }

  // ─── Refund (admin) ───────────────────────────────────────────────────────

  async refundEscrow(adminId: string, escrowId: string, dto: RefundEscrowDto) {
    const escrow = await this.prisma.escrow.findUnique({ where: { id: escrowId } });
    if (!escrow) throw new NotFoundException('Escrow not found');
    if (!['FUNDED', 'ACTIVE', 'DISPUTED'].includes(escrow.status)) {
      throw new BadRequestException(`Cannot refund escrow in status: ${escrow.status}`);
    }

    await this.escrowQueue.add(
      JobName.REFUND_ESCROW,
      { escrowId, adminId, reason: dto.reason },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    return { message: 'Refund initiated.' };
  }

  // ─── Approve release (2-of-2) ────────────────────────────────────────────

  async approveRelease(userId: string, escrowId: string, role: 'CLIENT' | 'FREELANCER') {
    const escrow = await this.prisma.escrow.findUnique({ where: { id: escrowId } });
    if (!escrow) throw new NotFoundException('Escrow not found');

    if (role === 'CLIENT' && escrow.clientId !== userId) throw new ForbiddenException('Not your escrow');
    if (role === 'FREELANCER' && escrow.freelancerId !== userId) throw new ForbiddenException('Not your escrow');
    if (!['FUNDED', 'ACTIVE'].includes(escrow.status)) {
      throw new BadRequestException(`Cannot approve release for escrow in status: ${escrow.status}`);
    }

    await this.escrowQueue.add(
      JobName.APPROVE_RELEASE,
      { escrowId, approverId: userId, role },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    return { message: 'Approval recorded. Release triggers when both parties have approved.' };
  }

  // ─── Complete milestone ───────────────────────────────────────────────────

  async completeMilestone(freelancerId: string, escrowId: string) {
    const escrow = await this.prisma.escrow.findUnique({ where: { id: escrowId } });
    if (!escrow) throw new NotFoundException('Escrow not found');
    if (escrow.freelancerId !== freelancerId) throw new ForbiddenException('Not your escrow');
    if (!['FUNDED', 'ACTIVE'].includes(escrow.status)) {
      throw new BadRequestException(`Cannot complete milestone for escrow in status: ${escrow.status}`);
    }
    if (escrow.milestonesTotal === 0) {
      throw new BadRequestException('This escrow has no milestone tracking enabled');
    }
    if (escrow.milestonesCompleted >= escrow.milestonesTotal) {
      throw new BadRequestException('All milestones are already completed');
    }

    await this.escrowQueue.add(
      JobName.COMPLETE_MILESTONE,
      { escrowId, freelancerId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    return { message: 'Milestone completion submitted for on-chain recording.' };
  }

  // ─── Claim expired ────────────────────────────────────────────────────────

  async claimExpired(userId: string, escrowId: string) {
    const escrow = await this.prisma.escrow.findUnique({ where: { id: escrowId } });
    if (!escrow) throw new NotFoundException('Escrow not found');
    if (!['FUNDED', 'ACTIVE'].includes(escrow.status)) {
      throw new BadRequestException(`Escrow is not in a claimable status: ${escrow.status}`);
    }
    if (escrow.expiryLedger === 0) {
      throw new BadRequestException('This escrow has no expiry set');
    }

    await this.escrowQueue.add(
      JobName.CLAIM_EXPIRED,
      { escrowId, triggeredBy: userId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    return { message: 'Expiry claim submitted. Funds will be returned to the client if the ledger has passed.' };
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async getEscrow(userId: string, escrowId: string) {
    const escrow = await this.prisma.escrow.findFirst({
      where: {
        id: escrowId,
        OR: [{ clientId: userId }, { freelancerId: userId }],
      },
      select: {
        id: true,
        status: true,
        amount: true,
        fee: true,
        currency: true,
        description: true,
        milestoneTitle: true,
        milestonesTotal: true,
        milestonesCompleted: true,
        expiryLedger: true,
        clientApproved: true,
        freelancerApproved: true,
        stellarContractId: true,
        stellarTxHash: true,
        fundedAt: true,
        releasedAt: true,
        refundedAt: true,
        expiredAt: true,
        createdAt: true,
        client: { select: { id: true, firstName: true, email: true } },
        freelancer: { select: { id: true, firstName: true, email: true } },
        dispute: true,
      },
    });
    if (!escrow) throw new NotFoundException('Escrow not found');
    return escrow;
  }

  async getMilestones(userId: string, escrowId: string) {
    const escrow = await this.prisma.escrow.findFirst({
      where: {
        id: escrowId,
        OR: [{ clientId: userId }, { freelancerId: userId }],
      },
      select: {
        id: true,
        milestonesTotal: true,
        milestonesCompleted: true,
        status: true,
      },
    });
    if (!escrow) throw new NotFoundException('Escrow not found');
    return {
      escrowId: escrow.id,
      total: escrow.milestonesTotal,
      completed: escrow.milestonesCompleted,
      remaining: escrow.milestonesTotal - escrow.milestonesCompleted,
      status: escrow.status,
    };
  }

  async listEscrows(userId: string, role: string, page: number, limit: number) {
    const where = role === 'CLIENT'
      ? { clientId: userId }
      : role === 'FREELANCER'
      ? { freelancerId: userId }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.escrow.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          amount: true,
          description: true,
          milestonesTotal: true,
          milestonesCompleted: true,
          expiryLedger: true,
          createdAt: true,
          client: { select: { id: true, firstName: true } },
          freelancer: { select: { id: true, firstName: true } },
        },
      }),
      this.prisma.escrow.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
