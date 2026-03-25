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

import { fetchJSON, paginateCongressAPI, getCongressAPIBaseUrl, sleep } from './lib/api-client.mjs';
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
    // Index by bioguide ID
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
    // Debug: show a sample
    const sampleKey = Object.keys(index)[0];
    console.log(`  Got social data for ${Object.keys(index).length} members`);
    console.log(`  Sample (${sampleKey}):`, JSON.stringify(index[sampleKey])?.slice(0, 200));
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

async function fetchMemberDetail(bioguideId) {
  const url = `${getCongressAPIBaseUrl()}/member/${bioguideId}?api_key=${API_KEY}&format=json`;
  await sleep(300);
  try {
    const data = await fetchJSON(url);
    return data.member || null;
  } catch (err) {
    console.warn(`  Warning: Could not fetch detail for ${bioguideId}: ${err.message}`);
    return null;
  }
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

  // Get state and district
  const state = congressMember.state || legData?.terms?.slice(-1)?.[0]?.state || '';
  const district = legData?.terms?.slice(-1)?.[0]?.district;

  // Build member summary
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

  // Build detailed info
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
    sponsoredBills: detail?.sponsoredLegislation?.count ? [] : [],
  };

  return { summary, detail: memberDetail };
}

async function main() {
  console.log('=== Fetching Congress Members ===\n');

  // Fetch all data sources in parallel
  const [congressMembers, legIndex, socialIndex] = await Promise.all([
    fetchCongressMembers(),
    fetchLegislatorsYaml(),
    fetchSocialMedia(),
  ]);

  console.log('\nFetching individual member details...');
  const summaries = [];
  let processed = 0;

  for (const cm of congressMembers) {
    const bioguideId = cm.bioguideId;
    if (!bioguideId) continue;

    // Fetch detail from Congress.gov
    const detail = await fetchMemberDetail(bioguideId);

    // Merge with unitedstates data
    const legData = legIndex[bioguideId] || null;
    const socialData = socialIndex[bioguideId] || null;

    const { summary, detail: memberDetail } = normalizeMember(cm, detail, legData, socialData);
    summaries.push(summary);

    // Write individual member file
    writeJSON(`members/${bioguideId}.json`, memberDetail);

    processed++;
    if (processed % 50 === 0) {
      console.log(`  Processed ${processed}/${congressMembers.length} members`);
    }
  }

  // Sort summaries: Senate first, then House; within each by state then name
  summaries.sort((a, b) => {
    if (a.chamber !== b.chamber) return a.chamber === 'Senate' ? -1 : 1;
    if (a.state !== b.state) return a.state.localeCompare(b.state);
    return a.lastName.localeCompare(b.lastName);
  });

  // Write index
  const index = {
    lastUpdated: new Date().toISOString(),
    congress: CONGRESS_NUMBER,
    total: summaries.length,
    members: summaries,
  };
  writeJSON('members/index.json', index);

  // Write meta
  writeJSON('meta/last-updated.json', {
    members: new Date().toISOString(),
  });

  console.log(`\nDone! Wrote ${summaries.length} member files + index.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
