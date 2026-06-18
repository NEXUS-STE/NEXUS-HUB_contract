// apps/api/src/escrow/escrow.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateEscrowDto } from './dto/create-escrow.dto';
import { ReleaseEscrowDto } from './dto/release-escrow.dto';
import { JobName, QueueName } from '@nexus-hub/shared/enums';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(QueueName.ESCROW) private readonly escrowQueue: Queue,
    @InjectQueue(QueueName.WEBHOOK) private readonly webhookQueue: Queue,
  ) {}

  async createEscrow(clientId: string, dto: CreateEscrowDto, idempotencyKey: string) {
    // Check idempotency
    const existing = await this.prisma.transaction.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return existing;

    const amount = new Decimal(dto.amount);
    const fee = amount.mul(0.01); // 1% platform fee
    const totalDebit = amount.add(fee);

    return this.prisma.$transaction(async (tx) => {
      // Verify freelancer exists
      const freelancer = await tx.user.findUnique({ where: { id: dto.freelancerId } });
      if (!freelancer) throw new NotFoundException('Freelancer not found');
      if (freelancer.role !== 'FREELANCER') {
        throw new BadRequestException('Target user is not a freelancer');
      }

      // Check & reserve client balance
      const balance = await tx.balance.findUnique({ where: { userId: clientId } });
      if (!balance || new Decimal(balance.availableAmount).lt(totalDebit)) {
        throw new BadRequestException('Insufficient balance. Please top up first.');
      }

      await tx.balance.update({
        where: { userId: clientId, version: balance.version },
        data: {
          availableAmount: { decrement: totalDebit },
          reservedAmount: { increment: amount },
          version: { increment: 1 },
        },
      });

      // Create escrow record
      const escrow = await tx.escrow.create({
        data: {
          clientId,
          freelancerId: dto.freelancerId,
          amount,
          fee,
          description: dto.description,
          milestoneTitle: dto.milestoneTitle,
          status: 'PENDING',
        },
      });

      // Create transaction record
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

      // Enqueue Stellar contract creation
      await this.escrowQueue.add(
        JobName.FUND_ESCROW,
        { escrowId: escrow.id, clientId, amount: amount.toFixed(6) },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );

      this.logger.log(`Escrow ${escrow.id} created, queued for Stellar funding`);
      return escrow;
    });
  }

  async releaseEscrow(clientId: string, escrowId: string, dto: ReleaseEscrowDto) {
    const escrow = await this.prisma.escrow.findUnique({
      where: { id: escrowId },
      include: { client: true, freelancer: true },
    });

    if (!escrow) throw new NotFoundException('Escrow not found');
    if (escrow.clientId !== clientId) throw new ForbiddenException('Not your escrow');
    if (escrow.status !== 'FUNDED' && escrow.status !== 'ACTIVE') {
      throw new BadRequestException(`Cannot release escrow in status: ${escrow.status}`);
    }

    await this.escrowQueue.add(
      JobName.RELEASE_ESCROW,
      { escrowId, clientId, feedback: dto.feedback },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    return { message: 'Release initiated. Funds will be transferred to freelancer.' };
  }

  async refundEscrow(adminId: string, escrowId: string, reason: string) {
    const escrow = await this.prisma.escrow.findUnique({ where: { id: escrowId } });
    if (!escrow) throw new NotFoundException('Escrow not found');
    if (!['FUNDED', 'ACTIVE', 'DISPUTED'].includes(escrow.status)) {
      throw new BadRequestException(`Cannot refund escrow in status: ${escrow.status}`);
    }

    await this.escrowQueue.add(
      JobName.REFUND_ESCROW,
      { escrowId, adminId, reason },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    return { message: 'Refund initiated.' };
  }

  async getEscrow(userId: string, escrowId: string) {
    const escrow = await this.prisma.escrow.findFirst({
      where: {
        id: escrowId,
        OR: [{ clientId: userId }, { freelancerId: userId }],
      },
      include: { client: { select: { id: true, firstName: true, email: true } }, freelancer: { select: { id: true, firstName: true, email: true } }, dispute: true },
    });
    if (!escrow) throw new NotFoundException('Escrow not found');
    return escrow;
  }

  async listEscrows(userId: string, role: string, page: number, limit: number) {
    const where = role === 'CLIENT' ? { clientId: userId } : role === 'FREELANCER' ? { freelancerId: userId } : {};
    const [data, total] = await Promise.all([
      this.prisma.escrow.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { client: { select: { id: true, firstName: true } }, freelancer: { select: { id: true, firstName: true } } },
      }),
      this.prisma.escrow.count({ where }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
