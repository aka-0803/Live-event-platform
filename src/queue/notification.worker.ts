import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { NOTIFICATIONS_QUEUE, getRedisConnection } from './redis-connection';
import { JoinEventJobData } from './notification.producer';

// Runs as its own process (`npm run worker`), independent of the Nest HTTP server,
// so notification processing keeps working even if the API is scaled separately.
const prisma = new PrismaClient();

const worker = new Worker<JoinEventJobData>(
  NOTIFICATIONS_QUEUE,
  async (job: Job<JoinEventJobData>) => {
    const { userId, userName, eventId, eventTitle } = job.data;
    const message = `User ${userName} joined Event ${eventTitle}`;

    await prisma.notification.create({
      data: { userId, message },
    });

    console.log(`[notification] eventId=${eventId} -> ${message}`);
  },
  { connection: getRedisConnection() },
);

worker.on('completed', (job) => {
  console.log(`[notification worker] job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[notification worker] job ${job?.id} failed: ${err.message}`);
});

console.log('Notification worker started, waiting for jobs...');
