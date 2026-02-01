import { Worker } from 'bullmq';
import path from 'path';
import fs from 'fs';
import { collectMediaUrls } from './crawler.js';
import { downloadAll } from './downloader.js';

// Directory where albums will be stored.  Use a relative path to
// allow running from the project root or via npm scripts.
const DATA_DIR = path.resolve('./data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Create a BullMQ worker that listens for "crawl" jobs.  Each job
// contains an albumId, url, and filter object.  The worker crawls
// the target page for media URLs, persists metadata, and then
// downloads the images/GIFs into the album directory.  Errors are
// logged but do not crash the worker; BullMQ will track failed jobs.
const worker = new Worker(
  'crawl',
  async (job) => {
    const { albumId, url, filters = {} } = job.data;
    const albumDir = path.join(DATA_DIR, albumId);
    fs.mkdirSync(albumDir, { recursive: true });
    console.log(`Starting crawl job for album ${albumId}: ${url}`);

    // Collect media URLs using the Playwright-based crawler.
    let mediaUrls;
    try {
      mediaUrls = await collectMediaUrls(url, filters);
    } catch (err) {
      console.error('Crawler failed:', err);
      throw err;
    }

    // Write a metadata file describing the crawl.
    fs.writeFileSync(
      path.join(albumDir, 'meta.json'),
      JSON.stringify({ url, count: mediaUrls.length, filters }, null, 2)
    );

    // Download all media URLs concurrently.
    try {
      await downloadAll(mediaUrls, albumDir, filters);
    } catch (err) {
      console.error('Downloader encountered errors:', err);
    }
    console.log(`Completed download for album ${albumId}`);
    return { downloaded: true, found: mediaUrls.length };
  },
  {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
  }
);

// Log job completion and failure events for monitoring.
worker.on('completed', (job) => {
  console.log('Job completed', job.id);
});
worker.on('failed', (job, err) => {
  console.error('Job failed', job.id, err);
});