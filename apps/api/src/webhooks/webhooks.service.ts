// apps/api/src/webhooks/webhooks.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { RegisterWebhookDto } from './dto/register-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { QueueName, JobName } from '@nexus-hub/shared/enums';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(QueueName.WEBHOOK) private readonly webhookQueue: Queue,
  ) {}

  async register(userId: string, dto: RegisterWebhookDto) {
    const secret = crypto.randomBytes(32).toString('hex');
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        userId,
        url: dto.url,
        secret,
        events: dto.events,
        description: dto.description,
        isActive: true,
      },
    });

    return { ...endpoint, secret }; // Return secret once only at creation
  }

  async update(userId: string, endpointId: string, dto: UpdateWebhookDto) {
    await this.findAndVerifyOwnership(userId, endpointId);
    return this.prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: dto,
    });
  }

  async delete(userId: string, endpointId: string) {
    await this.findAndVerifyOwnership(userId, endpointId);
    await this.prisma.webhookEndpoint.delete({ where: { id: endpointId } });
    return { message: 'Webhook endpoint deleted' };
  }

  async list(userId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { userId },
      select: { id: true, url: true, events: true, isActive: true, description: true, createdAt: true },
    });
  }

  async getDeliveries(userId: string, endpointId: string, page: number, limit: number) {
    await this.findAndVerifyOwnership(userId, endpointId);
    const [data, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where: { endpointId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.webhookDelivery.count({ where: { endpointId } }),
    ]);
    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async rotateSecret(userId: string, endpointId: string) {
    await this.findAndVerifyOwnership(userId, endpointId);
    const newSecret = crypto.randomBytes(32).toString('hex');
    await this.prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: { secret: newSecret },
    });
    return { secret: newSecret, message: 'Secret rotated. Update your integration.' };
  }

  // Called by the worker to dispatch a webhook event to all subscribed endpoints
  async dispatchEvent(event: string, payload: Record<string, unknown>) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { events: { has: event as any }, isActive: true },
    });

    this.logger.log(`Dispatching event ${event} to ${endpoints.length} endpoint(s)`);

    for (const endpoint of endpoints) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          endpointId: endpoint.id,
          event: event as any,
          payload,
          status: 'PENDING',
        },
      });

      await this.webhookQueue.add(
        JobName.DELIVER_WEBHOOK,
        { deliveryId: delivery.id, url: endpoint.url, secret: endpoint.secret, event, payload },
        { attempts: 5, backoff: { type: 'exponential', delay: 10000 } },
      );
    }
  }

  // Verify HMAC signature for incoming Airtm / TW webhooks
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  private async findAndVerifyOwnership(userId: string, endpointId: string) {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({ where: { id: endpointId } });
    if (!endpoint) throw new NotFoundException('Webhook endpoint not found');
    if (endpoint.userId !== userId) throw new ForbiddenException('Access denied');
    return endpoint;
  }
}
