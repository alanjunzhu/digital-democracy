/**
 * Slim per-member vote index: store only voteId + voteCast in by-member.json
 * to keep the aggregate file under GitHub's 100MB limit. Display fields are
 * joined from votes/index.json at build time.
 */

export function slimMemberVoteEntry(voteId, voteCast) {
  return { voteId, voteCast };
}

export function rebuildByMemberIndex(votes, { isBioguideId = id => /^[A-Z]\d{6}$/i.test(String(id || '')) } = {}) {
  const byMember = {};
  for (const vote of votes) {
    for (const mv of vote.memberVotes || []) {
      const id = mv.bioguideId;
      if (!isBioguideId(id)) continue;
      if (!byMember[id]) byMember[id] = [];
      byMember[id].push(slimMemberVoteEntry(vote.voteId, mv.voteCast));
    }
  }
  return byMember;
}

/** Join slim member votes with roll-call summaries for pages and analytics. */
export function enrichMemberVotes(slimVotes, summaryByVoteId) {
  const enriched = [];
  for (const mv of slimVotes || []) {
    const summary = summaryByVoteId?.[mv.voteId];
    if (!summary) continue;
    enriched.push({
      voteId: mv.voteId,
      rollCallNumber: summary.rollCallNumber,
      chamber: summary.chamber,
      date: summary.date,
      question: summary.question,
      result: summary.result,
      billId: summary.billId || null,
      topic: summary.topic || null,
      voteCast: mv.voteCast,
    });
  }
  return enriched;
}

export function summariesByVoteId(votes) {
  const map = {};
  for (const v of votes || []) {
    if (v.voteId) map[v.voteId] = v;
  }
  return map;
}
