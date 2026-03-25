/**
 * Shared API client with rate limiting, pagination, and retry logic.
 */

const DEFAULT_DELAY_MS = 500;
const MAX_RETRIES = 3;

export async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        const wait = Math.pow(2, attempt) * 1000;
        console.warn(`Rate limited. Waiting ${wait}ms before retry...`);
        await sleep(wait);
        continue;
      }
      if (response.status >= 500) {
        const wait = Math.pow(2, attempt) * 1000;
        console.warn(`Server error ${response.status}. Waiting ${wait}ms before retry...`);
        await sleep(wait);
        continue;
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
}

export async function fetchJSON(url, options = {}) {
  const response = await fetchWithRetry(url, options);
  return response.json();
}

/**
 * Paginate through Congress.gov API results.
 * Yields each page of results.
 */
export async function* paginateCongressAPI(baseUrl, apiKey, { limit = 250, maxPages = 100 } = {}) {
  let offset = 0;
  let page = 0;

  while (page < maxPages) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}api_key=${apiKey}&limit=${limit}&offset=${offset}&format=json`;

    await sleep(DEFAULT_DELAY_MS);
    const data = await fetchJSON(url);
    yield data;

    // Check if there are more results
    const pagination = data.pagination;
    if (!pagination || offset + limit >= pagination.count) {
      break;
    }
    offset += limit;
    page++;
  }
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getCongressAPIBaseUrl() {
  return 'https://api.congress.gov/v3';
}
