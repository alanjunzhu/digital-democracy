#!/usr/bin/env node
/**
 * Precompute counterfactual timing for top committee-overlap trades.
 * Output: data/finances/trade-timing.json
 */

import { readJSON, writeJSON } from './lib/data-writer.mjs';
import { fetchYahooPrices } from '../shared/stock-prices.mjs';
import {
  buildSuspiciousTradeCandidates,
  computeCounterfactuals,
  tradeTimingKey,
} from '../shared/trade-timing.mjs';

const LIMIT = 25;
const DELAY_MS = 800;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const financeData = readJSON('finances/by-member.json');
  if (!financeData) {
    console.error('No finance data found');
    process.exit(1);
  }

  const billsIndex = readJSON('bills/index.json')?.bills || [];
  const billsBySponsor = {};
  for (const bill of billsIndex) {
    const id = bill.sponsor?.bioguideId;
    if (!id) continue;
    if (!billsBySponsor[id]) billsBySponsor[id] = [];
    billsBySponsor[id].push(bill);
  }

  const candidates = buildSuspiciousTradeCandidates(financeData, {
    limit: LIMIT,
    billsBySponsor,
  });

  const output = {
    lastUpdated: new Date().toISOString(),
    entries: {},
  };

  console.log(`Enriching timing for ${candidates.length} trades...`);

  for (const trade of candidates) {
    const key = tradeTimingKey(trade);
    try {
      const tx = trade.transactionDate;
      const prices = await fetchYahooPrices(trade.ticker, tx, tx);
      const counterfactuals = computeCounterfactuals(trade, prices);
      output.entries[key] = {
        prices: prices.filter((p) => p.date >= tx.slice(0, 4) + '-01-01'),
        counterfactuals,
      };
      console.log(`  ✓ ${trade.ticker} ${tx} (${trade.memberName})`);
    } catch (err) {
      console.warn(`  ✗ ${trade.ticker} ${trade.transactionDate}: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  writeJSON('finances/trade-timing.json', output);
  console.log(`Wrote ${Object.keys(output.entries).length} entries to data/finances/trade-timing.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
