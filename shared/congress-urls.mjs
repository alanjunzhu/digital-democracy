/**
 * Canonical congress.gov and Congress.gov API URL builders.
 *
 * Shared by the fetch scripts (which write these URLs into data/) and by the
 * Astro pages (which derive them at build time so already-committed data does
 * not need to be refetched).
 */

/** Path segment congress.gov uses for each bill type. */
const BILL_TYPE_PATHS = {
  hr: 'house-bill',
  s: 'senate-bill',
  hjres: 'house-joint-resolution',
  sjres: 'senate-joint-resolution',
  hconres: 'house-concurrent-resolution',
  sconres: 'senate-concurrent-resolution',
  hres: 'house-resolution',
  sres: 'senate-resolution',
};

/** Display label for each bill type. */
const BILL_TYPE_LABELS = {
  hr: 'H.R.',
  s: 'S.',
  hjres: 'H.J.Res.',
  sjres: 'S.J.Res.',
  hconres: 'H.Con.Res.',
  sconres: 'S.Con.Res.',
  hres: 'H.Res.',
  sres: 'S.Res.',
};

/**
 * Reduce any spelling of a bill type ("HR", "H.R.", "hr") to the API's form.
 * @param {string} type
 * @returns {string}
 */
export function normalizeBillType(type) {
  return String(type || '').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * @param {string} type
 * @returns {string} Display label, e.g. "H.J.Res."
 */
export function formatBillType(type) {
  const key = normalizeBillType(type);
  return BILL_TYPE_LABELS[key] || String(type || '').toUpperCase();
}

/**
 * @param {string} type
 * @returns {'House' | 'Senate'}
 */
export function billOriginChamber(type) {
  return normalizeBillType(type).startsWith('s') ? 'Senate' : 'House';
}

/**
 * @param {number | string} n
 * @returns {string} e.g. 119 -> "119th", 121 -> "121st"
 */
export function ordinal(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  const mod100 = Math.abs(num) % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${num}th`;
  switch (Math.abs(num) % 10) {
    case 1: return `${num}st`;
    case 2: return `${num}nd`;
    case 3: return `${num}rd`;
    default: return `${num}th`;
  }
}

/**
 * Public congress.gov page for a bill or resolution.
 *
 * Resolutions live under their own path segment: H.Res. 34 is
 * /house-resolution/34, not /house-bill/34 (which is an unrelated measure).
 *
 * @param {number | string} congress
 * @param {string} type
 * @param {number | string} number
 * @returns {string | null} null when the type is not a known bill type
 */
export function getBillWebUrl(congress, type, number) {
  const typePath = BILL_TYPE_PATHS[normalizeBillType(type)];
  if (!typePath || !congress || !number) return null;
  return `https://www.congress.gov/bill/${ordinal(congress)}-congress/${typePath}/${number}`;
}

/**
 * @param {number | string} congress
 * @param {string} type
 * @param {number | string} number
 * @returns {string | null}
 */
export function getBillTextWebUrl(congress, type, number) {
  const url = getBillWebUrl(congress, type, number);
  return url ? `${url}/text` : null;
}

/**
 * @param {string} type
 * @param {number | string} number
 * @returns {string} Stable id used for data filenames and site routes.
 */
export function getBillId(type, number) {
  return `${normalizeBillType(type)}${number}`;
}

/** Committees whose congress.gov slug cannot be derived from their name. */
const UNDERIVABLE_COMMITTEE_NAME = /commission|caucus|task force|select committee on|select subcommittee/i;

/**
 * A systemCode ending in "00" is a full committee; anything else is a
 * subcommittee of the committee sharing its first four characters.
 * @param {string} systemCode
 * @returns {boolean}
 */
export function isSubcommitteeCode(systemCode) {
  const code = String(systemCode || '');
  return code.length > 2 && !code.endsWith('00');
}

/**
 * @param {string} systemCode
 * @returns {string} systemCode of the parent committee
 */
export function parentCommitteeCode(systemCode) {
  const code = String(systemCode || '');
  return isSubcommitteeCode(code) ? `${code.slice(0, 4)}00` : code;
}

/**
 * congress.gov slug for a committee, e.g. ("House", "Ways and Means Committee")
 * -> "house-ways-and-means".
 *
 * @param {string} chamber
 * @param {string} name
 * @returns {string | null} null when the name does not follow a derivable pattern
 */
export function committeeSlug(chamber, name) {
  const chamberSlug = String(chamber || '').toLowerCase().trim();
  if (!['house', 'senate', 'joint'].includes(chamberSlug)) return null;
  if (!name || UNDERIVABLE_COMMITTEE_NAME.test(name)) return null;

  const base = String(name)
    .replace(/\([^)]*\)/g, ' ')            // "Intelligence (Select) Committee"
    // "Committee on House Administration", "Joint Committee on Taxation"
    .replace(/^\s*(house|senate|joint)?\s*committee on (the )?/i, '')
    .replace(/\s+(sub)?committee\s*$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!base) return null;
  // "Committee on House Administration" already carries the chamber name.
  return base === chamberSlug || base.startsWith(`${chamberSlug}-`)
    ? base
    : `${chamberSlug}-${base}`;
}

/**
 * Public congress.gov profile page for a full committee.
 *
 * congress.gov has no profile page for individual subcommittees — they are
 * listed on their parent's page — so callers must pass a full committee's
 * systemCode together with that committee's own name.
 *
 * @param {string} chamber
 * @param {string} systemCode
 * @param {string} name
 * @returns {string | null} null when no reliable URL can be built
 */
export function getCommitteeWebUrl(chamber, systemCode, name) {
  if (!systemCode || isSubcommitteeCode(systemCode)) return null;
  const slug = committeeSlug(chamber, name);
  if (!slug) return null;
  return `https://www.congress.gov/committee/${slug}/${systemCode}`;
}

export const API_BASE_URL = 'https://api.congress.gov/v3';

/**
 * @param {string} url
 * @returns {boolean} true for api.congress.gov referrer URLs, which are not
 *   suitable to show to visitors.
 */
export function isApiUrl(url) {
  return /^https?:\/\/api\.congress\.gov\//i.test(String(url || ''));
}
