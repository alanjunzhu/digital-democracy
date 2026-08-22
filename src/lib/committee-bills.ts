import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getBillWebUrl } from '../../shared/congress-urls.mjs';
import { buildCommitteeLookup, normalizeBillCommittees, resolveCommittee } from './committees';
import type { BillDetail, CommitteeBillRef, CommitteeSummary } from './types';

/**
 * Committee referrals recorded on bills, grouped by committee.
 *
 * `data/committees/{code}.json` carries the referrals reported by the
 * committee endpoint, but bill records list referrals too. Reading them lets a
 * committee page show its legislation even when the committee data predates
 * bill fetching, and covers referrals the two sources report differently.
 *
 * Built once per build and reused across committee pages.
 */
let cache: Map<string, CommitteeBillRef[]> | null = null;

export function getBillsByCommittee(dataDir = join(process.cwd(), 'data')): Map<string, CommitteeBillRef[]> {
  if (cache) return cache;

  const byCommittee = new Map<string, CommitteeBillRef[]>();
  const committeesPath = join(dataDir, 'committees', 'index.json');
  const billsDir = join(dataDir, 'bills');

  if (!existsSync(billsDir)) {
    cache = byCommittee;
    return cache;
  }

  let committeeList: CommitteeSummary[] = [];
  if (existsSync(committeesPath)) {
    try {
      committeeList = JSON.parse(readFileSync(committeesPath, 'utf-8')).committees || [];
    } catch {}
  }
  const lookup = buildCommitteeLookup(committeeList);

  for (const file of readdirSync(billsDir)) {
    if (file === 'index.json' || !file.endsWith('.json')) continue;

    let bill: BillDetail;
    try {
      bill = JSON.parse(readFileSync(join(billsDir, file), 'utf-8'));
    } catch {
      continue;
    }

    for (const ref of normalizeBillCommittees(bill.committees)) {
      const committee = resolveCommittee(ref, lookup, bill.originChamber);
      const code = committee?.systemCode || ref.systemCode;
      if (!code) continue;

      const latestActivity = (ref.activities || [])
        .map(a => (a.date || '').slice(0, 10))
        .filter(Boolean)
        .sort()
        .pop();

      const entry: CommitteeBillRef = {
        billId: bill.billId,
        congress: bill.congress,
        type: bill.type,
        number: bill.number,
        relationshipType: ref.activities?.[0]?.name || '',
        actionDate: latestActivity || bill.latestActionDate || bill.introducedDate || '',
        url: getBillWebUrl(bill.congress, bill.type, bill.number),
      };

      const existing = byCommittee.get(code);
      if (existing) existing.push(entry);
      else byCommittee.set(code, [entry]);
    }
  }

  for (const bills of byCommittee.values()) {
    bills.sort((a, b) => (b.actionDate || '').localeCompare(a.actionDate || '') || a.billId.localeCompare(b.billId));
  }

  cache = byCommittee;
  return cache;
}

/** Merge referrals from the committee endpoint with those found on bills. */
export function mergeCommitteeBills(
  fromCommittee: CommitteeBillRef[] | undefined,
  fromBills: CommitteeBillRef[] | undefined
): CommitteeBillRef[] {
  const merged = new Map<string, CommitteeBillRef>();
  for (const bill of [...(fromCommittee || []), ...(fromBills || [])]) {
    const existing = merged.get(bill.billId);
    if (!existing) {
      merged.set(bill.billId, bill);
      continue;
    }
    merged.set(bill.billId, {
      ...existing,
      relationshipType: existing.relationshipType || bill.relationshipType,
      actionDate: existing.actionDate || bill.actionDate,
    });
  }

  return [...merged.values()].sort(
    (a, b) => (b.actionDate || '').localeCompare(a.actionDate || '') || a.billId.localeCompare(b.billId)
  );
}
