import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NOTIFICATIONS_QUEUE, getRedisConnection } from './redis-connection';

export interface JoinEventJobData {
  userId: number;
  userName: string;
  eventId: number;
  eventTitle: string;
}

@Injectable()
export class NotificationProducer implements OnModuleDestroy {
  private readonly queue = new Queue<JoinEventJobData>(NOTIFICATIONS_QUEUE, {
    connection: getRedisConnection(),
  });

  async addJoinEventJob(data: JoinEventJobData) {
    await this.queue.add('user-joined-event', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
