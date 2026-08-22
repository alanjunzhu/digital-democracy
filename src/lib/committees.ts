import type { BillCommitteeRef, CommitteeSummary } from './types';

/**
 * Committee referrals were once stored as bare names. Read both shapes so
 * pages keep working against data fetched before systemCodes were recorded.
 */
export function normalizeBillCommittees(
  committees: (string | BillCommitteeRef)[] | undefined
): BillCommitteeRef[] {
  if (!committees) return [];
  return committees
    .map(c => (typeof c === 'string' ? { name: c } : c))
    .filter(c => Boolean(c?.name));
}

export interface CommitteeLookup {
  byCode: Map<string, CommitteeSummary>;
  byName: Map<string, CommitteeSummary[]>;
}

export function buildCommitteeLookup(committees: CommitteeSummary[]): CommitteeLookup {
  const byCode = new Map<string, CommitteeSummary>();
  const byName = new Map<string, CommitteeSummary[]>();

  for (const committee of committees) {
    if (committee.systemCode) byCode.set(committee.systemCode, committee);
    if (!committee.name) continue;
    const key = committee.name.toLowerCase();
    const existing = byName.get(key);
    if (existing) existing.push(committee);
    else byName.set(key, [committee]);
  }

  return { byCode, byName };
}

/**
 * Resolve a bill's committee referral to a committee we have a page for.
 *
 * A systemCode identifies the committee outright. Falling back to the name
 * alone is ambiguous — the House and Senate both have a "Judiciary Committee" —
 * so a chamber hint decides between same-named committees.
 */
export function resolveCommittee(
  ref: BillCommitteeRef,
  lookup: CommitteeLookup,
  chamberHint?: string
): CommitteeSummary | null {
  if (ref.systemCode) {
    const exact = lookup.byCode.get(ref.systemCode);
    if (exact) return exact;
  }

  const candidates = lookup.byName.get((ref.name || '').toLowerCase()) || [];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const chamber = ref.chamber || chamberHint;
  return candidates.find(c => c.chamber === chamber) || null;
}
