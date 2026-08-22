/**
 * Shared API client with rate limiting, pagination, retry, and batch concurrency.
 */

import { API_BASE_URL } from '../../shared/congress-urls.mjs';

const MAX_RETRIES = 3;

export async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  let lastStatus = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        lastStatus = response.status;
        const wait = Math.pow(2, attempt) * 1000;
        console.warn(`Rate limited. Waiting ${wait}ms before retry...`);
        await sleep(wait);
        continue;
      }
      if (response.status >= 500) {
        lastStatus = response.status;
        const wait = Math.pow(2, attempt) * 1000;
        console.warn(`Server error ${response.status}. Waiting ${wait}ms before retry...`);
        await sleep(wait);
        continue;
      }
      if (response.status === 404) {
        return null; // Don't retry 404s — resource doesn't exist
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
      }
      return response;
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = Math.pow(2, attempt) * 1000;
      console.warn(`Request failed: ${err.message}. Retrying in ${wait}ms...`);
      await sleep(wait);
    }
  }

  throw new Error(`Gave up after ${retries + 1} attempts (last status ${lastStatus}) for ${url}`);
}

export async function fetchJSON(url, options = {}) {
  const response = await fetchWithRetry(url, options);
  if (!response) return null; // 404 returns null
  return response.json();
}

/**
 * Paginate through Congress.gov API results.
 * Yields each page of results.
 *
 * @param {string} baseUrl
 * @param {string} apiKey
 * @param {Object} [options]
 * @param {number} [options.limit] Records per page (API maximum is 250)
 * @param {number} [options.maxPages]
 * @param {Record<string, string>} [options.params] Extra query params, e.g.
 *   `{ sort: 'updateDate+desc' }`. Values are passed through unencoded because
 *   the API expects the literal `+` in its sort values.
 */
export async function* paginateCongressAPI(baseUrl, apiKey, { limit = 250, maxPages = 100, params = {} } = {}) {
  const extra = Object.entries(params)
    .map(([key, value]) => `&${key}=${value}`)
    .join('');
  let offset = 0;

  for (let page = 0; page < maxPages; page++) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}api_key=${apiKey}&limit=${limit}&offset=${offset}&format=json${extra}`;

    const data = await fetchJSON(url);
    if (!data) return; // 404 — nothing more to read
    yield data;

    const count = data.pagination?.count;
    if (typeof count !== 'number' || offset + limit >= count) return;
    offset += limit;
  }
}

/**
 * Process items in concurrent batches with rate limiting.
 * Much faster than sequential processing while respecting API limits.
 *
 * @param {Array} items - Items to process
 * @param {Function} processFn - async (item, index) => result
 * @param {Object} options
 * @param {number} options.concurrency - Max concurrent requests (default: 10)
 * @param {number} options.delayMs - Delay between batch starts (default: 100)
 * @param {string} options.label - Label for progress logging
 */
export async function batchProcess(items, processFn, { concurrency = 10, delayMs = 100, label = 'items' } = {}) {
  const results = new Array(items.length);
  let completed = 0;
  let nextIndex = 0;
  const startTime = Date.now();

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      if (delayMs > 0 && idx > 0) {
        await sleep(delayMs);
      }
      try {
        results[idx] = await processFn(items[idx], idx);
      } catch (err) {
        results[idx] = null;
      }
      completed++;
      if (completed % 50 === 0 || completed === items.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  ${label}: ${completed}/${items.length} (${elapsed}s)`);
      }
    }
  }

  // Launch concurrent workers
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Fetch multiple URLs concurrently, returning results in order.
 * Null for failed/404 requests.
 */
export async function batchFetchJSON(urls, { concurrency = 10, delayMs = 100, label = 'requests' } = {}) {
  return batchProcess(urls, async (url) => {
    try {
      return await fetchJSON(url);
    } catch {
      return null;
    }
  }, { concurrency, delayMs, label });
}

/**
 * Fetch multiple URLs as text concurrently, returning results in order.
 * Null for failed/404 requests.
 */
export async function batchFetchText(urls, { concurrency = 15, delayMs = 50, label = 'requests' } = {}) {
  return batchProcess(urls, async (url) => {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }, { concurrency, delayMs, label });
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getCongressAPIBaseUrl() {
  return process.env.CONGRESS_API_BASE_URL || API_BASE_URL;
}
