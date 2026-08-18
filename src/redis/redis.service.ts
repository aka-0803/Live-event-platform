import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  public readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.get<string>('REDIS_HOST') || 'localhost',
      port: Number(config.get<string>('REDIS_PORT')) || 6379,
    });
  }

  // Duplicate the connection - required for the Socket.IO Redis adapter,
  // which needs separate pub/sub client instances.
  duplicate(): Redis {
    return this.client.duplicate();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
