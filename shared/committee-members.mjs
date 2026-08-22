/**
 * Build reverse lookup: committee name -> member summaries.
 * Committee names come from finance profiles (unitedstates membership mapped to our index).
 */

export function buildCommitteeMemberIndex(financeData, membersIndex = []) {
  const memberMeta = Object.fromEntries(
    (membersIndex || []).map((m) => [m.bioguideId, m]),
  );
  const byCommittee = {};

  for (const [bioguideId, profile] of Object.entries(financeData?.members || {})) {
    const meta = memberMeta[bioguideId];
    if (!meta) continue;

    for (const committeeName of profile.committees || []) {
      if (!byCommittee[committeeName]) byCommittee[committeeName] = [];
      byCommittee[committeeName].push({
        bioguideId,
        name: profile.name || meta.name,
        party: meta.party,
        chamber: meta.chamber,
        state: meta.state,
        district: meta.district,
        imageUrl: meta.imageUrl,
      });
    }
  }

  for (const members of Object.values(byCommittee)) {
    members.sort((a, b) => a.name.localeCompare(b.name));
  }

  return byCommittee;
}

export function getCommitteeMembers(committeeMemberIndex, committeeName) {
  return committeeMemberIndex[committeeName] || [];
}
