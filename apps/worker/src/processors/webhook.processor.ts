// apps/worker/src/processors/webhook.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { QueueName, JobName } from '@nexus-hub/shared/enums';
import * as crypto from 'crypto';

@Injectable()
@Processor(QueueName.WEBHOOK)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);
  private readonly MAX_TIMEOUT_MS = 10_000;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job) {
    if (job.name === JobName.DELIVER_WEBHOOK) {
      return this.deliverWebhook(job);
    }
  }

  private async deliverWebhook(job: Job) {
    const { deliveryId, url, secret, event, payload } = job.data as {
      deliveryId: string;
      url: string;
      secret: string;
      event: string;
      payload: Record<string, unknown>;
    };

    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    this.logger.log(`Delivering webhook [${event}] → ${url}`);

    let responseCode: number | null = null;
    let responseBody: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.MAX_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NexusHub-Signature': `sha256=${signature}`,
          'X-NexusHub-Event': event,
          'X-NexusHub-Delivery': deliveryId,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      responseCode = response.status;
      responseBody = await response.text();

      if (!response.ok) {
        throw new Error(`Endpoint returned ${response.status}: ${responseBody}`);
      }

      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'DELIVERED',
          responseCode,
          responseBody,
          attempts: job.attemptsMade + 1,
          deliveredAt: new Date(),
        },
      });

      this.logger.log(`Webhook ${deliveryId} delivered (${responseCode})`);
      return { delivered: true };
    } catch (error) {
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 5);

      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: isLastAttempt ? 'FAILED' : 'RETRYING',
          responseCode,
          responseBody: responseBody ?? String(error),
          attempts: job.attemptsMade + 1,
          nextRetryAt: isLastAttempt ? null : new Date(Date.now() + 10_000 * Math.pow(2, job.attemptsMade)),
        },
      });

      this.logger.warn(`Webhook ${deliveryId} failed (attempt ${job.attemptsMade + 1})`);
      throw error; // Let BullMQ handle retry
    }
  }
}
