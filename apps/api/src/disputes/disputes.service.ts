// apps/api/src/disputes/disputes.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { OpenDisputeDto } from './dto/open-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { QueueName, JobName } from '@nexus-hub/shared/enums';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QueueName.WEBHOOK) private readonly webhookQueue: Queue,
  ) {}

  async openDispute(userId: string, dto: OpenDisputeDto) {
    const escrow = await this.prisma.escrow.findFirst({
      where: {
        id: dto.escrowId,
        OR: [{ clientId: userId }, { freelancerId: userId }],
      },
    });

    if (!escrow) throw new NotFoundException('Escrow not found or access denied');
    if (!['FUNDED', 'ACTIVE'].includes(escrow.status)) {
      throw new BadRequestException(`Cannot dispute escrow in status: ${escrow.status}`);
    }

    const existingDispute = await this.prisma.dispute.findUnique({
      where: { escrowId: dto.escrowId },
    });
    if (existingDispute) throw new ConflictException('A dispute already exists for this escrow');

    const dispute = await this.prisma.$transaction(async (tx) => {
      const newDispute = await tx.dispute.create({
        data: {
          escrowId: dto.escrowId,
          raisedById: userId,
          reason: dto.reason,
          description: dto.description,
          evidence: dto.evidence ?? [],
          status: 'OPEN',
        },
      });

      await tx.escrow.update({
        where: { id: dto.escrowId },
        data: { status: 'DISPUTED' },
      });

      return newDispute;
    });

    // Notify via webhook
    await this.webhookQueue.add(JobName.DELIVER_WEBHOOK, {
      event: 'DISPUTE_OPENED',
      payload: { disputeId: dispute.id, escrowId: dto.escrowId, raisedById: userId },
    });

    this.logger.log(`Dispute ${dispute.id} opened on escrow ${dto.escrowId}`);
    return dispute;
  }

  async resolveDispute(adminId: string, disputeId: string, dto: ResolveDisputeDto) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { escrow: true },
    });

    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status !== 'OPEN' && dispute.status !== 'UNDER_REVIEW') {
      throw new BadRequestException('Dispute is not open for resolution');
    }

    const resolvedDispute = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: dto.resolution,
          resolution: dto.notes,
          resolvedAt: new Date(),
        },
      });

      // Trigger escrow outcome based on resolution
      if (dto.resolution === 'RESOLVED_CLIENT') {
        await tx.escrow.update({ where: { id: dispute.escrowId }, data: { status: 'REFUNDED' } });
        // Refund logic would go through escrow queue
      } else if (dto.resolution === 'RESOLVED_FREELANCER') {
        await tx.escrow.update({ where: { id: dispute.escrowId }, data: { status: 'RELEASED' } });
        // Release logic would go through escrow queue
      }

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'RESOLVE_DISPUTE',
          entity: 'Dispute',
          entityId: disputeId,
          newValues: { resolution: dto.resolution, notes: dto.notes },
        },
      });

      return updated;
    });

    await this.webhookQueue.add(JobName.DELIVER_WEBHOOK, {
      event: 'DISPUTE_RESOLVED',
      payload: { disputeId, resolution: dto.resolution },
    });

    return resolvedDispute;
  }

  async setUnderReview(adminId: string, disputeId: string) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status !== 'OPEN') throw new BadRequestException('Dispute is not open');

    return this.prisma.dispute.update({
      where: { id: disputeId },
      data: { status: 'UNDER_REVIEW' },
    });
  }

  async getDispute(userId: string, role: string, disputeId: string) {
    const where = role === 'ADMIN' ? { id: disputeId } : { id: disputeId, raisedById: userId };
    const dispute = await this.prisma.dispute.findFirst({
      where,
      include: { escrow: true, raisedBy: { select: { id: true, firstName: true, email: true } } },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    return dispute;
  }

  async listDisputes(userId: string, role: string, page: number, limit: number) {
    const where = role === 'ADMIN' ? {} : { raisedById: userId };
    const [data, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { escrow: { select: { id: true, amount: true, status: true } }, raisedBy: { select: { id: true, firstName: true } } },
      }),
      this.prisma.dispute.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
