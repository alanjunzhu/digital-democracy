#!/usr/bin/env node
/**
 * Restore the member fields that come from unitedstates/congress-legislators:
 * names, website, phone, office address and social links.
 *
 * theunitedstates.io stopped resolving, and because fetch-members.mjs treated
 * that as a warning it rewrote every member with those fields empty. This fills
 * them back in from the project's GitHub Pages copy. No Congress.gov API key is
 * needed, so the committed data can be repaired without a full refetch.
 *
 * Usage: node scripts/backfill-member-bio.mjs [--check]
 */

import { readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import { join } from 'path';
import { fetchUnitedstatesFile } from './lib/unitedstates.mjs';
import { getDataDir, readJSON, writeJSON } from './lib/data-writer.mjs';
import { compareMembers, preserveExistingValues, splitMemberName } from './fetch-members.mjs';

const checkOnly = process.argv.includes('--check');

async function loadIndexed(fileName, label) {
  const data = await fetchUnitedstatesFile(fileName, label);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Could not load ${label} from any host`);
  }
  const index = {};
  for (const entry of data) {
    if (entry?.id?.bioguide) index[entry.id.bioguide] = entry;
  }
  return index;
}

/** Fields the supplementary source owns, built from a legislator record. */
export function bioFields(member, legislator, social) {
  const term = legislator?.terms?.slice(-1)?.[0] || {};
  const parsedName = splitMemberName(member.name);

  // Records arrive as { id, social: {...} }; accept a bare social object too.
  const handles = social?.social || social || {};
  const socialMedia = {
    twitter: handles.twitter || undefined,
    facebook: handles.facebook || undefined,
    youtube: handles.youtube || handles.youtube_id || undefined,
  };

  return {
    firstName: legislator?.name?.first || parsedName.firstName || '',
    lastName: legislator?.name?.last || parsedName.lastName || '',
    website: term.url || '',
    phone: term.phone || '',
    officeAddress: term.address || '',
    birthDate: legislator?.bio?.birthday || '',
    gender: legislator?.bio?.gender || '',
    socialMedia: Object.values(socialMedia).some(Boolean) ? socialMedia : undefined,
  };
}

/** Bio fields that belong on an index summary; the rest are detail-only. */
const SUMMARY_BIO_KEYS = new Set(['firstName', 'lastName', 'website', 'phone']);

/**
 * @param {Object} record
 * @param {Object} sources - { legislators, social }
 * @param {'summary' | 'detail'} shape - summaries must not gain detail-only keys
 */
export function fillMemberRecord(record, { legislators, social }, shape) {
  const fields = bioFields(record, legislators[record.bioguideId], social[record.bioguideId]);
  const applicable = {};
  for (const [key, value] of Object.entries(fields)) {
    if (shape === 'summary' && !SUMMARY_BIO_KEYS.has(key)) continue;
    if (value === undefined) continue;
    applicable[key] = value;
  }

  // Existing values win; this only fills what is blank or missing.
  return { ...record, ...preserveExistingValues(applicable, record) };
}

async function main() {
  const [legislators, social] = await Promise.all([
    loadIndexed('legislators-current.json', 'legislator'),
    loadIndexed('legislators-social-media.json', 'social media'),
  ]);

  let changed = 0;

  const index = readJSON('members/index.json');
  if (index?.members) {
    // Re-sorted because the surnames the order depends on were blank.
    const filled = index.members
      .map(m => fillMemberRecord(m, { legislators, social }, 'summary'))
      .sort(compareMembers);
    if (JSON.stringify(filled) !== JSON.stringify(index.members)) {
      index.members = filled;
      changed++;
      if (!checkOnly) writeJSON('members/index.json', index);
    }
  }

  for (const file of readdirSync(join(getDataDir(), 'members'))) {
    if (file === 'index.json' || !file.endsWith('.json')) continue;
    const member = readJSON(`members/${file}`);
    if (!member?.bioguideId) continue;

    const filled = fillMemberRecord(member, { legislators, social }, 'detail');
    if (JSON.stringify(filled) === JSON.stringify(member)) continue;

    changed++;
    if (!checkOnly) writeJSON(`members/${file}`, filled);
  }

  console.log(`${checkOnly ? 'Would rewrite' : 'Rewrote'} ${changed} file(s).`);
  if (checkOnly && changed > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
