import { Queue } from 'bullmq';

// Export a BullMQ queue for crawl jobs. The connection settings can be
// customized via environment variables so that the app can run
// locally or inside a container with a Redis service.
export const crawlQueue = new Queue('crawl', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
});