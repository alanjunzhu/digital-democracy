import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_FETCH_HEADERS, fetchWithRetry, getCongressAPIBaseUrl, redactApiKey } from '../scripts/lib/api-client.mjs';

test('the API key is stripped from URLs before they reach a log line', () => {
  assert.equal(
    redactApiKey('https://api.congress.gov/v3/bill/119?api_key=abc123&format=json'),
    'https://api.congress.gov/v3/bill/119?api_key=REDACTED&format=json'
  );
  assert.equal(
    redactApiKey('https://api.congress.gov/v3/bill/119?format=json&api_key=abc123'),
    'https://api.congress.gov/v3/bill/119?format=json&api_key=REDACTED'
  );
  assert.equal(
    redactApiKey('https://api.congress.gov/v3/bill/119?format=json'),
    'https://api.congress.gov/v3/bill/119?format=json'
  );
});

test('a failing request reports the failure without leaking the key', async () => {
  const url = 'https://api.congress.gov/v3/bill/119?api_key=super-secret&format=json';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('nope', { status: 400, statusText: 'Bad Request' });

  try {
    await assert.rejects(fetchWithRetry(url), err => {
      assert.match(err.message, /HTTP 400/);
      assert.ok(!err.message.includes('super-secret'), `key leaked into: ${err.message}`);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requests identify the project instead of the default node client', async () => {
  let headers;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    headers = options?.headers;
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    await fetchWithRetry('https://example.test/ok');
    assert.equal(headers['User-Agent'], DEFAULT_FETCH_HEADERS['User-Agent']);
    assert.match(headers['User-Agent'], /digital-democracy/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a forbidden URL is not retried', async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    return new Response('', { status: 403, statusText: 'Forbidden' });
  };

  try {
    assert.equal(await fetchWithRetry('https://example.test/closed'), null);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the API base URL can be pointed elsewhere for testing', () => {
  const original = process.env.CONGRESS_API_BASE_URL;
  try {
    delete process.env.CONGRESS_API_BASE_URL;
    assert.equal(getCongressAPIBaseUrl(), 'https://api.congress.gov/v3');
    process.env.CONGRESS_API_BASE_URL = 'http://127.0.0.1:1234';
    assert.equal(getCongressAPIBaseUrl(), 'http://127.0.0.1:1234');
  } finally {
    if (original === undefined) delete process.env.CONGRESS_API_BASE_URL;
    else process.env.CONGRESS_API_BASE_URL = original;
  }
});
