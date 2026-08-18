import { ConnectionOptions } from 'bullmq';

// Shared Redis connection settings used by both the queue producer (API process)
// and the worker (separate process started via `npm run worker`).
export function getRedisConnection(): ConnectionOptions {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  };
}

export const NOTIFICATIONS_QUEUE = 'notifications';
