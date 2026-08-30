/**
 * Whether a roll call carried, was rejected, or cannot be told.
 *
 * The two chambers phrase results differently. The House Clerk records a bare
 * "Passed" / "Failed", while the Senate spells the motion out — "Nomination
 * Confirmed (51-47)", "Cloture Motion Agreed to (50-45)", "Motion to Discharge
 * Rejected (49-50)". Across the 119th Congress that is over 300 distinct
 * result strings, so comparing against a fixed set only ever matches the House
 * form and files every verbose Senate result under "rejected" — which is how
 * roughly a third of all roll calls came to be labelled backwards. The wording
 * has to be read, not compared.
 *
 * Negative wording is tested first on purpose: "Not Sustained" also contains
 * "Sustained", and "Motion to Table Failed" also contains "Table".
 */

const REJECTED = /reject|fail|defeat|not sustained|not agreed/;
const AGREED = /agreed to|passed|confirmed|sustained|well taken|adopted/;

/** @returns {'agreed' | 'rejected' | 'unknown'} */
export function getVoteOutcome(result) {
  const r = String(result || '').toLowerCase();
  if (!r) return 'unknown';
  if (REJECTED.test(r)) return 'rejected';
  if (AGREED.test(r)) return 'agreed';
  return 'unknown';
}

/**
 * Short verdict for an outcome column. Falls back to the source string rather
 * than guessing, so an unparseable result is never asserted to be a defeat.
 */
export function getVoteVerdict(result) {
  const outcome = getVoteOutcome(result);
  if (outcome === 'agreed') return 'Agreed';
  if (outcome === 'rejected') return 'Rejected';
  return String(result || '—');
}
