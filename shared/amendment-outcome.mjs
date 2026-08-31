/**
 * What happened to an amendment, read from its latest action.
 *
 * Amendment actions are phrased as freely as roll-call results are: "Amendment
 * SA 2137 agreed to in Senate by Yea-Nay Vote. 51-49.", "On agreeing to the
 * Roy amendment; Failed by recorded vote", "Proposed amendment withdrawn by
 * unanimous consent". Comparing against a fixed set of strings is what left a
 * third of all roll calls rendering backwards, so the wording is read here too.
 *
 * Order matters. Negatives are tested first because "not agreed to" contains
 * "agreed to", and withdrawal is tested before both because an amendment can be
 * withdrawn after being offered and would otherwise read as pending.
 */

const WITHDRAWN = /withdrawn|withdraw/;
const REJECTED = /not agreed to|reject|fail|defeat|ruled out of order|fell|tabled|motion to table .*agreed/;
const AGREED = /agreed to|accepted|adopted|passed|incorporated/;

/** @typedef {'agreed' | 'rejected' | 'withdrawn' | 'pending'} AmendmentDisposition */

/**
 * @param {string | null | undefined} latestAction
 * @returns {AmendmentDisposition}
 */
export function getAmendmentDisposition(latestAction) {
  const a = String(latestAction || '').toLowerCase();
  if (!a) return 'pending';
  if (WITHDRAWN.test(a)) return 'withdrawn';
  if (REJECTED.test(a)) return 'rejected';
  if (AGREED.test(a)) return 'agreed';
  return 'pending';
}

/** Short label for the disposition column. */
export function getAmendmentVerdict(latestAction) {
  switch (getAmendmentDisposition(latestAction)) {
    case 'agreed': return 'Agreed to';
    case 'rejected': return 'Rejected';
    case 'withdrawn': return 'Withdrawn';
    default: return 'Pending';
  }
}

/**
 * Dot colour per disposition, in the same vocabulary bill stages use: navy for
 * the affirmative, red for the negative, and quiet ink for everything that has
 * not resolved. Nothing here turns green.
 */
export const AMENDMENT_DISPOSITION_DOT = {
  agreed: 'bg-yea',
  rejected: 'bg-accent',
  withdrawn: 'bg-ink-3',
  pending: 'bg-pending',
};

export const AMENDMENT_DISPOSITIONS = ['agreed', 'rejected', 'withdrawn', 'pending'];
