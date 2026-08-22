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

import { pathToFileURL } from 'url';
import { fetchJSON, paginateCongressAPI, getCongressAPIBaseUrl, batchProcess } from './lib/api-client.mjs';
import { writeJSON, readJSON } from './lib/data-writer.mjs';
import { fetchUnitedstatesFile } from './lib/unitedstates.mjs';

const API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_NUMBER = 119; // Current congress


export async function fetchLegislatorFile(fileName, label) {
  const data = await fetchUnitedstatesFile(fileName, label);
  return Array.isArray(data) && data.length > 0 ? data : null;
}

async function fetchLegislatorsYaml() {
  console.log('Fetching unitedstates/congress-legislators data...');
  const data = await fetchLegislatorFile('legislators-current.json', 'legislator');
  if (!data) return null;

  const index = {};
  for (const leg of data) {
    if (leg?.id?.bioguide) index[leg.id.bioguide] = leg;
  }
  return index;
}

async function fetchSocialMedia() {
  console.log('Fetching social media data...');
  const data = await fetchLegislatorFile('legislators-social-media.json', 'social media');
  if (!data) return null;

  const index = {};
  for (const entry of data) {
    if (entry?.id?.bioguide) index[entry.id.bioguide] = entry.social || entry;
  }
  return index;
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

/**
 * Congress.gov lists members as "Last, First Middle" without separate name
 * fields, so parse it rather than leaving names empty when the supplementary
 * source is unavailable.
 */
export function splitMemberName(name) {
  const raw = String(name || '').replace(/\s+/g, ' ').trim();
  if (!raw) return { firstName: '', lastName: '' };

  if (!raw.includes(',')) {
    const words = raw.split(' ');
    return { firstName: words[0], lastName: words.length > 1 ? words[words.length - 1] : '' };
  }

  const [family, ...rest] = raw.split(',');
  // "Smith, John, Jr." — the suffix follows the given names.
  const given = (rest.join(',').split(',')[0] || '').trim();
  return { firstName: given.split(' ')[0] || '', lastName: family.trim() };
}

/** Senate first, then House; within a chamber by state, then surname. */
export function compareMembers(a, b) {
  if (a.chamber !== b.chamber) return a.chamber === 'Senate' ? -1 : 1;
  if (a.state !== b.state) return (a.state || '').localeCompare(b.state || '');
  return (a.lastName || '').localeCompare(b.lastName || '');
}

export function isEmptyValue(value) {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.values(value).every(isEmptyValue);
  return false;
}

/**
 * Fill blanks in a freshly built record from the record already on disk.
 *
 * A fetch that loses one of its sources should leave what it cannot refresh
 * alone. Without this, an outage at the supplementary source rewrote all 553
 * members with empty names and websites.
 */
export function preserveExistingValues(next, previous) {
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) return next;

  const merged = { ...next };
  for (const key of Object.keys(next)) {
    const nextValue = merged[key];
    const previousValue = previous[key];
    if (isEmptyValue(previousValue)) continue;

    if (isEmptyValue(nextValue)) {
      merged[key] = previousValue;
    } else if (
      nextValue && previousValue &&
      typeof nextValue === 'object' && !Array.isArray(nextValue) &&
      typeof previousValue === 'object' && !Array.isArray(previousValue)
    ) {
      merged[key] = preserveExistingValues(nextValue, previousValue);
    }
  }

  return merged;
}

function extractCommittees(detail) {
  if (!detail) return [];
  // Congress.gov API member detail may include committee assignments
  const committees = [];
  // Try various response structures
  const sources = [
    detail.committees,
    detail.committeeAssignments,
    detail.currentCommittees,
  ];
  for (const src of sources) {
    if (Array.isArray(src)) {
      for (const c of src) {
        const name = c.name || c.committeeName || '';
        if (name && !committees.includes(name)) committees.push(name);
      }
    } else if (src && typeof src === 'object') {
      // Could be { url: "...", count: N } style reference
      const items = src.items || src.committees || [];
      if (Array.isArray(items)) {
        for (const c of items) {
          const name = c.name || c.committeeName || '';
          if (name && !committees.includes(name)) committees.push(name);
        }
      }
    }
  }
  return committees;
}

export function normalizeMember(congressMember, detail, legData, socialData) {
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

  const parsedName = splitMemberName(congressMember.name);

  const summary = {
    bioguideId,
    name: congressMember.name || `${congressMember.firstName} ${congressMember.lastName}`,
    firstName: congressMember.firstName || legData?.name?.first || parsedName.firstName,
    lastName: congressMember.lastName || legData?.name?.last || parsedName.lastName,
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
    committees: extractCommittees(detail),
    sponsoredBills: [],
  };

  return { summary, detail: memberDetail };
}

async function main() {
  console.log('=== Fetching Congress Members ===\n');
  const startTime = Date.now();

  if (!API_KEY) {
    console.error('Error: CONGRESS_API_KEY environment variable is required.');
    console.error('Get a free key at: https://api.data.gov/signup/');
    process.exit(1);
  }

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

  // Normalize all members, keeping anything a failed source could not refresh
  const summaries = [];
  for (let i = 0; i < congressMembers.length; i++) {
    const cm = congressMembers[i];
    const bioguideId = cm.bioguideId;
    if (!bioguideId) continue;

    const detail = details[i];
    const legData = legIndex?.[bioguideId] || null;
    const socialData = socialIndex?.[bioguideId] || null;

    const { summary, detail: memberDetail } = normalizeMember(cm, detail, legData, socialData);
    const previous = readJSON(`members/${bioguideId}.json`);
    summaries.push(preserveExistingValues(summary, previous));
    writeJSON(`members/${bioguideId}.json`, preserveExistingValues(memberDetail, previous));
  }

  summaries.sort(compareMembers);

  const index = {
    lastUpdated: new Date().toISOString(),
    congress: CONGRESS_NUMBER,
    total: summaries.length,
    members: summaries,
  };
  writeJSON('members/index.json', index);

  const missingNames = summaries.filter(m => !m.firstName || !m.lastName).length;
  const missingWebsites = summaries.filter(m => !m.website).length;
  if (missingNames > 0 || missingWebsites > 0) {
    console.warn(`Warning: ${missingNames} member(s) without a parsed name, ${missingWebsites} without a website.`);
  }

  writeJSON('meta/last-updated.json', {
    ...(readJSON('meta/last-updated.json') || {}),
    members: new Date().toISOString(),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone! Wrote ${summaries.length} member files + index in ${elapsed}s.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
