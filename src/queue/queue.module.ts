import { Module } from '@nestjs/common';
import { NotificationProducer } from './notification.producer';

@Module({
  providers: [NotificationProducer],
  exports: [NotificationProducer],
})
export class QueueModule {}
