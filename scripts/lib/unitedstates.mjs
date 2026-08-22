/**
 * unitedstates/congress-legislators files.
 *
 * theunitedstates.io stopped resolving; the same JSON is published on the
 * project's GitHub Pages site. Try that first and keep the old host as a fallback.
 */

import { fetchJSON } from './api-client.mjs';

export const UNITEDSTATES_HOSTS = [
  'https://unitedstates.github.io/congress-legislators',
  'https://theunitedstates.io/congress-legislators',
];

function recordCount(data) {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') return Object.keys(data).length;
  return 0;
}

export async function fetchUnitedstatesFile(fileName, label) {
  for (const host of UNITEDSTATES_HOSTS) {
    try {
      const data = await fetchJSON(`${host}/${fileName}`);
      const count = recordCount(data);
      if (count > 0) {
        console.log(`  Got ${count} ${label} records from ${host}`);
        return data;
      }
      console.warn(`  ${host} returned no ${label} records`);
    } catch (err) {
      console.warn(`  ${host} unavailable for ${label}: ${err.message}`);
    }
  }
  console.warn(`  Warning: no source returned ${label}; existing values will be kept.`);
  return null;
}

/**
 * Congress.gov systemCodes end in `00` for the parent committee (`hswm00`).
 * unitedstates membership keys drop that suffix (`HSWM`) and keep extra digits
 * for subcommittees (`HSWM04`).
 *
 * @param {string} systemCode
 * @returns {string[]}
 */
export function committeeMembershipKeys(systemCode) {
  const upper = String(systemCode || '').trim().toUpperCase();
  if (!upper) return [];
  const keys = [upper];
  if (upper.endsWith('00') && upper.length > 2) keys.push(upper.slice(0, -2));
  return keys;
}

/**
 * Map unitedstates committee-membership-current.json onto `{ bioguide: [names] }`.
 * Names come from our committee index so member pages can link by systemCode.
 *
 * @param {Record<string, { bioguide?: string }[]>} membershipFile
 * @param {{ systemCode?: string, name?: string }[]} committees
 * @returns {Record<string, string[]>}
 */
export function mapCommitteeMemberships(membershipFile, committees = []) {
  const memberships = {};
  if (!membershipFile || typeof membershipFile !== 'object' || Array.isArray(membershipFile)) {
    return memberships;
  }

  const nameByKey = new Map();
  for (const committee of committees) {
    if (!committee?.systemCode || !committee.name) continue;
    for (const key of committeeMembershipKeys(committee.systemCode)) {
      if (!nameByKey.has(key)) nameByKey.set(key, committee.name);
    }
  }

  for (const [code, members] of Object.entries(membershipFile)) {
    if (!Array.isArray(members)) continue;
    const upper = String(code).toUpperCase();
    const name = nameByKey.get(upper) || nameByKey.get(upper.replace(/00$/, ''));
    if (!name) continue;

    for (const member of members) {
      const bioguide = member?.bioguide;
      if (!bioguide) continue;
      if (!memberships[bioguide]) memberships[bioguide] = [];
      if (!memberships[bioguide].includes(name)) memberships[bioguide].push(name);
    }
  }

  return memberships;
}
