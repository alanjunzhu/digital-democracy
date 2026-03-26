#!/usr/bin/env node
/**
 * Fetch all current members of Congress from:
 * 1. Congress.gov API (primary)
 * 2. unitedstates/congress-legislators (supplementary bio data)
 *
 * Outputs:
 *   data/members/index.json    - Summary list of all current members
 *   data/members/{bioguideId}.json - Individual member details
 */

import { fetchJSON, paginateCongressAPI, getCongressAPIBaseUrl, batchProcess } from './lib/api-client.mjs';
import { writeJSON, readJSON } from './lib/data-writer.mjs';

const API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_NUMBER = 119; // Current congress

if (!API_KEY) {
  console.error('Error: CONGRESS_API_KEY environment variable is required.');
  console.error('Get a free key at: https://api.data.gov/signup/');
  process.exit(1);
}

async function fetchLegislatorsYaml() {
  console.log('Fetching unitedstates/congress-legislators data...');
  const url = 'https://theunitedstates.io/congress-legislators/legislators-current.json';
  try {
    const data = await fetchJSON(url);
    console.log(`  Got ${data.length} legislators from unitedstates project`);
    const index = {};
    for (const leg of data) {
      index[leg.id.bioguide] = leg;
    }
    return index;
  } catch (err) {
    console.warn(`  Warning: Could not fetch legislators data: ${err.message}`);
    return {};
  }
}

async function fetchSocialMedia() {
  console.log('Fetching social media data...');
  const url = 'https://theunitedstates.io/congress-legislators/legislators-social-media.json';
  try {
    const data = await fetchJSON(url);
    const index = {};
    for (const entry of data) {
      const social = entry.social || entry;
      index[entry.id.bioguide] = social;
    }
    console.log(`  Got social data for ${Object.keys(index).length} members`);
    return index;
  } catch (err) {
    console.warn(`  Warning: Could not fetch social media data: ${err.message}`);
    return {};
  }
}

async function fetchCongressMembers() {
  console.log(`Fetching members from Congress.gov API (Congress ${CONGRESS_NUMBER})...`);
  const baseUrl = `${getCongressAPIBaseUrl()}/member/congress/${CONGRESS_NUMBER}`;
  const allMembers = [];

  for await (const page of paginateCongressAPI(baseUrl, API_KEY)) {
    const members = page.members || [];
    allMembers.push(...members);
    console.log(`  Fetched ${allMembers.length} members so far...`);
  }

  console.log(`  Total: ${allMembers.length} members from Congress.gov`);
  return allMembers;
}

function normalizeMember(congressMember, detail, legData, socialData) {
  const bioguideId = congressMember.bioguideId;
  const currentTerm = detail?.terms?.slice(-1)[0] || {};

  const chamber = (congressMember.terms?.item || []).some(t =>
    t.chamber === 'Senate' && !t.endYear
  ) ? 'Senate' : (
    currentTerm.chamber === 'Senate' ? 'Senate' : 'House'
  );

  const party = congressMember.partyName || 'Unknown';
  const state = congressMember.state || legData?.terms?.slice(-1)?.[0]?.state || '';
  const district = legData?.terms?.slice(-1)?.[0]?.district;

  const summary = {
    bioguideId,
    name: congressMember.name || `${congressMember.firstName} ${congressMember.lastName}`,
    firstName: congressMember.firstName || legData?.name?.first || '',
    lastName: congressMember.lastName || legData?.name?.last || '',
    party,
    state,
    district: chamber === 'House' ? district : undefined,
    chamber,
    imageUrl: `https://bioguide.congress.gov/bioguide/photo/${bioguideId[0]}/${bioguideId}.jpg`,
    url: `https://www.congress.gov/member/${bioguideId}`,
    website: legData?.terms?.slice(-1)?.[0]?.url || detail?.addressInformation?.website || '',
    phone: legData?.terms?.slice(-1)?.[0]?.phone || detail?.addressInformation?.phoneNumber || '',
  };

  const memberDetail = {
    ...summary,
    birthDate: legData?.bio?.birthday || detail?.birthYear?.toString() || '',
    gender: legData?.bio?.gender || '',
    terms: (detail?.terms || legData?.terms || []).map(t => ({
      chamber: t.chamber === 'Senate' || t.type === 'sen' ? 'Senate' : 'House',
      startDate: t.startYear?.toString() || t.start || '',
      endDate: t.endYear?.toString() || t.end || '',
      state: t.state || state,
      district: t.district,
      party: t.partyName || t.party || party,
    })),
    socialMedia: socialData ? {
      twitter: socialData.twitter || undefined,
      facebook: socialData.facebook || undefined,
      youtube: socialData.youtube || socialData.youtube_id || undefined,
    } : undefined,
    officeAddress: legData?.terms?.slice(-1)?.[0]?.address || detail?.addressInformation?.officeAddress || '',
    sponsoredBills: [],
  };

  return { summary, detail: memberDetail };
}

async function main() {
  console.log('=== Fetching Congress Members ===\n');
  const startTime = Date.now();

  // Fetch all data sources in parallel
  const [congressMembers, legIndex, socialIndex] = await Promise.all([
    fetchCongressMembers(),
    fetchLegislatorsYaml(),
    fetchSocialMedia(),
  ]);

  console.log('\nFetching individual member details (batched, 10 concurrent)...');

  // Batch fetch all member details — 10 concurrent requests
  // Congress.gov rate limit is 5,000/hr ≈ 83/min. 10 concurrent with 100ms delay is safe.
  const details = await batchProcess(
    congressMembers,
    async (cm) => {
      const url = `${getCongressAPIBaseUrl()}/member/${cm.bioguideId}?api_key=${API_KEY}&format=json`;
      try {
        const data = await fetchJSON(url);
        return data.member || null;
      } catch {
        return null;
      }
    },
    { concurrency: 10, delayMs: 100, label: 'member details' }
  );

  // Normalize all members
  const summaries = [];
  for (let i = 0; i < congressMembers.length; i++) {
    const cm = congressMembers[i];
    const bioguideId = cm.bioguideId;
    if (!bioguideId) continue;

    const detail = details[i];
    const legData = legIndex[bioguideId] || null;
    const socialData = socialIndex[bioguideId] || null;

    const { summary, detail: memberDetail } = normalizeMember(cm, detail, legData, socialData);
    summaries.push(summary);
    writeJSON(`members/${bioguideId}.json`, memberDetail);
  }

  // Sort summaries: Senate first, then House; within each by state then name
  summaries.sort((a, b) => {
    if (a.chamber !== b.chamber) return a.chamber === 'Senate' ? -1 : 1;
    if (a.state !== b.state) return a.state.localeCompare(b.state);
    return a.lastName.localeCompare(b.lastName);
  });

  const index = {
    lastUpdated: new Date().toISOString(),
    congress: CONGRESS_NUMBER,
    total: summaries.length,
    members: summaries,
  };
  writeJSON('members/index.json', index);

  writeJSON('meta/last-updated.json', {
    members: new Date().toISOString(),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone! Wrote ${summaries.length} member files + index in ${elapsed}s.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
