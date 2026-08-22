/**
 * Party-line and member–party alignment helpers.
 *
 * A member "aligns" with their party when their Yea/Nay matches the party's
 * majority on that roll call (ties and Present/Not Voting are skipped).
 */

export function partyBucket(party) {
  const p = String(party || '').toLowerCase();
  if (p.startsWith('d')) return 'democratic';
  if (p.startsWith('r')) return 'republican';
  if (p.startsWith('i')) return 'independent';
  return null;
}

export function normalizeVoteSide(cast) {
  const c = String(cast || '').toLowerCase().trim();
  if (c === 'yea' || c === 'aye' || c === 'yes') return 'yea';
  if (c === 'nay' || c === 'no') return 'nay';
  return null;
}

/** Majority side for a party tally, or null on a tie / empty tally. */
export function partyMajoritySide(tally) {
  if (!tally) return null;
  const yea = tally.yea || 0;
  const nay = tally.nay || 0;
  if (yea === nay || yea + nay === 0) return null;
  return yea > nay ? 'yea' : 'nay';
}

/**
 * A roll call is "party-line" when each major party has a clear majority and
 * those majorities disagree.
 */
export function isPartyLineVote(breakdown) {
  if (!breakdown) return false;
  const dem = partyMajoritySide(breakdown.democratic);
  const rep = partyMajoritySide(breakdown.republican);
  if (!dem || !rep) return false;
  return dem !== rep;
}

export function scoreMemberPartyAlignment(memberVotes, voteBreakdownById, memberParty) {
  const bucket = partyBucket(memberParty);
  let comparable = 0;
  let withParty = 0;

  // Independents caucus loosely; score against the Democratic majority when
  // present (Senate practice).
  const sideBucket = bucket === 'independent' ? 'democratic' : (bucket || 'democratic');

  for (const vote of memberVotes || []) {
    const cast = normalizeVoteSide(vote.voteCast);
    if (!cast) continue;
    const breakdown = voteBreakdownById[vote.voteId];
    const majority = partyMajoritySide(breakdown?.[sideBucket]);
    if (!majority) continue;
    comparable++;
    if (cast === majority) withParty++;
  }

  const againstParty = comparable - withParty;
  return {
    comparable,
    withParty,
    againstParty,
    pct: comparable > 0 ? Math.round((withParty / comparable) * 1000) / 10 : null,
  };
}

/**
 * Rank members by how often they vote with their party majority.
 */
export function rankPartyAlignment(members, byMember, voteBreakdownById, { chamber, limit = 15, order = 'desc' } = {}) {
  const rows = [];
  for (const m of members) {
    if (chamber && m.chamber !== chamber) continue;
    const votes = byMember[m.bioguideId] || [];
    const alignment = scoreMemberPartyAlignment(votes, voteBreakdownById, m.party);
    if (alignment.comparable < 10) continue;
    rows.push({
      bioguideId: m.bioguideId,
      name: m.name,
      party: m.party,
      chamber: m.chamber,
      state: m.state,
      alignment,
    });
  }

  rows.sort((a, b) => {
    const ap = a.alignment.pct ?? -1;
    const bp = b.alignment.pct ?? -1;
    if (order === 'asc') {
      if (ap !== bp) return ap - bp;
    } else if (bp !== ap) {
      return bp - ap;
    }
    return a.name.localeCompare(b.name);
  });

  return rows.slice(0, limit);
}

export function summarizePartyLineVotes(votes) {
  let partyLine = 0;
  let withBreakdown = 0;
  const byChamber = {};

  for (const vote of votes) {
    if (!vote.partyBreakdown) continue;
    withBreakdown++;
    const chamber = vote.chamber || 'Unknown';
    if (!byChamber[chamber]) byChamber[chamber] = { total: 0, partyLine: 0 };
    byChamber[chamber].total++;
    if (isPartyLineVote(vote.partyBreakdown)) {
      partyLine++;
      byChamber[chamber].partyLine++;
    }
  }

  return {
    total: withBreakdown,
    partyLine,
    pct: withBreakdown > 0 ? Math.round((partyLine / withBreakdown) * 1000) / 10 : 0,
    byChamber: Object.entries(byChamber).map(([chamber, stats]) => ({
      chamber,
      ...stats,
      pct: stats.total > 0 ? Math.round((stats.partyLine / stats.total) * 1000) / 10 : 0,
    })),
  };
}

/** Average alignment by party for the ranked rows. */
export function averageAlignmentByParty(rows) {
  const buckets = {};
  for (const row of rows) {
    if (row.alignment.pct == null) continue;
    const key = partyBucket(row.party) || 'other';
    if (!buckets[key]) buckets[key] = { sum: 0, n: 0 };
    buckets[key].sum += row.alignment.pct;
    buckets[key].n++;
  }
  return Object.entries(buckets).map(([party, { sum, n }]) => ({
    party,
    avg: n > 0 ? Math.round((sum / n) * 10) / 10 : 0,
    members: n,
  }));
}
