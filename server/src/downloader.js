import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

/**
 * Download a list of media URLs to a given album directory.  The
 * downloadAll function respects a concurrency limit and optional
 * maximum number of files to download.  Each file is named using
 * zero-padded indices so that ordering is preserved.
 *
 * @param {string[]} urls List of media URLs to download.
 * @param {string} albumDir Directory where the files should be saved.
 * @param {object} filters Additional download filters (maxFiles,
 * concurrency, etc.).
 */
export async function downloadAll(urls, albumDir, filters = {}) {
  const concurrency = Math.min(filters.concurrency ?? 6, 12);
  const maxFiles = filters.maxFiles ?? urls.length;
  const selected = urls.slice(0, maxFiles);

  let index = 0;
  async function worker() {
    while (index < selected.length) {
      const i = index++;
      const url = selected[i];
      try {
        await downloadOne(url, albumDir, i);
      } catch (err) {
        // Errors are logged but do not stop the batch.
        console.error(`Failed to download ${url}:`, err.message);
      }
    }
  }

  // Launch concurrent download workers.
  await Promise.all(Array.from({ length: concurrency }, worker));
}

/**
 * Download a single URL and write it to disk with a zero-padded
 * filename based on its index.  Attempts to infer the file
 * extension from the URL or Content-Type header.
 *
 * @param {string} url The media URL to fetch.
 * @param {string} albumDir Directory to save the file into.
 * @param {number} index Index used to build the filename.
 */
async function downloadOne(url, albumDir, index) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const clean = url.split(/[?#]/)[0];
  let ext = clean.split('.').pop()?.toLowerCase() || 'bin';
  const ct = res.headers.get('content-type') || '';
  if (ct.startsWith('image/')) {
    const t = ct.split('image/')[1].split(';')[0].trim();
    if (t) ext = t;
  }
  const filename = `${String(index).padStart(5, '0')}.${ext}`;
  fs.writeFileSync(path.join(albumDir, filename), buf);
}