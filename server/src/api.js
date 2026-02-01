import express from 'express';
import { crawlQueue } from './queue.js';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';

// Create an Express app that exposes a simple REST API.  The API
// provides endpoints for creating a new album crawling job and
// listing the files of a completed album.  It does not impose strict
// rate limits itself; instead, the queue and worker enforce
// concurrency limits.
const app = express();
app.use(express.json());

// Directory where albums and their downloaded media files will be stored.
const DATA_DIR = path.resolve('./data');
fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * POST /albums
 *
 * Create a new crawl job for the given URL.  The body should be a
 * JSON object with at least a `url` property and optionally a
 * `filters` object.  An albumId is generated and the job is
 * enqueued to the crawl queue.  The response includes the albumId
 * and a queued status.
 */
app.post('/albums', async (req, res) => {
  const { url, filters = {} } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  // Generate a unique album ID and create a directory for it.
  const albumId = uuid();
  const albumDir = path.join(DATA_DIR, albumId);
  fs.mkdirSync(albumDir, { recursive: true });

  // Enqueue a crawl job with the URL and filters.  Workers will
  // process this job asynchronously.
  await crawlQueue.add('crawl', { albumId, url, filters });

  res.json({ albumId, status: 'queued' });
});

/**
 * GET /albums/:albumId
 *
 * List the files in a completed album directory.  Returns 404 if
 * the album does not exist.  Also reads the meta.json if present
 * and returns it alongside the list of files.
 */
app.get('/albums/:albumId', (req, res) => {
  const albumDir = path.join(DATA_DIR, req.params.albumId);
  if (!fs.existsSync(albumDir)) {
    return res.status(404).json({ error: 'not found' });
  }

  // Filter out any JSON metadata files from the media file list.
  const files = fs
    .readdirSync(albumDir)
    .filter((f) => !f.endsWith('.json'));
  const metaPath = path.join(albumDir, 'meta.json');
  const meta = fs.existsSync(metaPath)
    ? JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    : {};

  res.json({ albumId: req.params.albumId, files, meta });
});

// Start the API server.  Use PORT env var if supplied, otherwise
// default to 3001.  Note: this file intentionally does not try to
// start the worker; that should be run separately to avoid blocking
// the event loop.
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});