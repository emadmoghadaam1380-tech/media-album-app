import { chromium } from 'playwright';

/**
 * Collect image and GIF URLs from a page.  This function uses a
 * headless Chromium browser via Playwright to load the page, scroll
 * to trigger lazy-loading, and then scrape various sources of media
 * URLs (img tags, source tags, CSS backgrounds).  The returned
 * URLs are normalized to absolute URLs relative to the page URL.
 *
 * @param {string} pageUrl The URL to crawl.
 * @param {object} filters Filters to apply (see applyFilters).
 * @returns {Promise<string[]>} A promise that resolves to an array of
 * absolute media URLs that satisfy the filters.
 */
export async function collectMediaUrls(pageUrl, filters = {}) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(pageUrl, { waitUntil: 'networkidle' });

  // Scroll a few times to trigger lazy-loaded images.
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(500);
  }

  // Execute a script in the page context to gather candidate media URLs.
  const urls = await page.evaluate(() => {
    const out = new Set();

    // Collect from <img> tags.
    document.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src');
      const dataSrc = img.getAttribute('data-src');
      const srcset = img.getAttribute('srcset');
      if (src) out.add(src);
      if (dataSrc) out.add(dataSrc);
      if (srcset) {
        srcset.split(',').forEach((part) => {
          const url = part.trim().split(' ')[0];
          if (url) out.add(url);
        });
      }
    });

    // Collect from <source> tags (for picture/video elements).
    document.querySelectorAll('source').forEach((el) => {
      const src = el.getAttribute('src');
      if (src) out.add(src);
    });

    // Collect CSS background-image URLs.
    document.querySelectorAll('*').forEach((el) => {
      const style = window.getComputedStyle(el);
      const bg = style.backgroundImage;
      if (bg && bg.startsWith('url(')) {
        // strip url("...") or url('...') wrapper
        const u = bg.slice(4, -1).replace(/["']/g, '');
        if (u) out.add(u);
      }
    });

    return Array.from(out);
  });

  await browser.close();

  // Normalize to absolute URLs relative to the page.
  const normalized = urls
    .map((u) => {
      try {
        return new URL(u, pageUrl).toString();
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((u) => /^https?:\/\//.test(u));

  return applyFilters(normalized, filters);
}

/**
 * Apply a set of filters to an array of media URLs.  Filters include
 * allowed file extensions, onlyGif, and a list of blocked domains.
 *
 * @param {string[]} urls A list of absolute media URLs.
 * @param {object} filters Filtering options.
 * @returns {string[]} The filtered list of URLs.
 */
function applyFilters(urls, filters) {
  const {
    onlyGif = false,
    allowTypes = ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    blockDomains = [],
  } = filters;

  return urls.filter((u) => {
    const host = new URL(u).hostname;
    if (blockDomains.includes(host)) return false;
    const ext = u
      .split('?')[0]
      .split('#')[0]
      .split('.')
      .pop()
      ?.toLowerCase();
    if (!ext) return false;
    if (onlyGif) return ext === 'gif';
    return allowTypes.includes(ext);
  });
}