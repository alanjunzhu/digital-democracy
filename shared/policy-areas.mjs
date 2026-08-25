/**
 * Policy-area index: which measures a roll call belongs to, how every member
 * voted on that area's contested measures, and where each party landed.
 *
 * Roll-call records carry no reliable policy label of their own: only a few
 * hundred have a `topic`, and the bills dataset covers a small slice of the
 * measures that reached a floor vote. So an area is inferred from whatever the
 * record does carry — its topic, the policy area of the bill it names, and the
 * wording of the question — and votes that stay unlabelled are reported as
 * such instead of being padded into an area.
 */

/** Broad areas, ordered the way the index page lists them. */
export const POLICY_AREAS = [
  { id: 'immigration', label: 'Immigration & Border', description: 'Border enforcement, asylum, visas, deportation.' },
  { id: 'health', label: 'Health Care', description: 'Medicare, Medicaid, drug pricing, public health.' },
  { id: 'economy', label: 'Budget, Taxes & Economy', description: 'Appropriations, the debt limit, tax and tariff measures.' },
  { id: 'finance', label: 'Banking & Housing', description: 'Financial regulation, securities, crypto, housing.' },
  { id: 'defense', label: 'Defense & Veterans', description: 'The armed forces, national security, veterans programs.' },
  { id: 'foreign', label: 'Foreign Policy', description: 'Treaties, sanctions, foreign aid, war powers.' },
  { id: 'energy', label: 'Energy & Environment', description: 'Drilling, emissions, public lands, climate rules.' },
  { id: 'justice', label: 'Crime, Courts & Civil Rights', description: 'Law enforcement, sentencing, civil rights and liberties.' },
  { id: 'education', label: 'Education & Labor', description: 'Schools, student aid, wages, workplace rules.' },
  { id: 'agriculture', label: 'Agriculture & Food', description: 'Farm programs, nutrition assistance, food safety.' },
  { id: 'technology', label: 'Tech & Infrastructure', description: 'Transportation, broadband, science, cybersecurity.' },
  { id: 'government', label: 'Government & Elections', description: 'Federal agencies, oversight, election administration.' },
  { id: 'nominations', label: 'Nominations', description: 'Confirmation votes on judges and executive officers.' },
];

const AREA_IDS = new Set(POLICY_AREAS.map(a => a.id));

/** Congress.gov policy areas and the vote `topic` field map onto the areas above. */
const TOPIC_TO_AREA = {
  'immigration': 'immigration',
  'health': 'health',
  'economics and public finance': 'economy',
  'taxation': 'economy',
  'finance and financial sector': 'finance',
  'housing and community development': 'finance',
  'armed forces and national security': 'defense',
  'international affairs': 'foreign',
  'foreign trade and international finance': 'foreign',
  'energy': 'energy',
  'environmental protection': 'energy',
  'public lands and natural resources': 'energy',
  'water resources development': 'energy',
  'animals': 'energy',
  'crime and law enforcement': 'justice',
  'civil rights and liberties, minority issues': 'justice',
  'civil rights and liberties': 'justice',
  'law': 'justice',
  'native americans': 'justice',
  'education': 'education',
  'labor and employment': 'education',
  'social welfare': 'education',
  'families': 'education',
  'agriculture and food': 'agriculture',
  'transportation and public works': 'technology',
  'science, technology, communications': 'technology',
  'transportation': 'technology',
  'commerce': 'technology',
  'government operations and politics': 'government',
  'congress': 'government',
  'emergency management': 'government',
  'nominations': 'nominations',
};

/**
 * Question / title wording, checked in order: the first area whose pattern
 * appears wins, so the narrower vocabularies come first.
 */
const KEYWORD_RULES = [
  { area: 'nominations', patterns: ['confirmation:', 'to be u.s. district judge', 'to be united states district judge', 'to be u.s. circuit judge', 'to be an assistant secretary', 'nomination of'] },
  { area: 'immigration', patterns: ['immigration', 'immigrant', 'border', 'asylum', 'deportation', 'visa', 'citizenship', 'alien', 'refugee', 'migrant', 'customs enforcement'] },
  { area: 'health', patterns: ['health', 'medicare', 'medicaid', 'hospital', 'medical', 'pharmaceutical', 'prescription', 'opioid', 'abortion', 'vaccine'] },
  { area: 'defense', patterns: ['defense', 'military', 'veteran', 'armed forces', 'national security', 'ndaa', 'pentagon', 'servicemember', 'national guard'] },
  { area: 'foreign', patterns: ['foreign', 'treaty', 'ambassador', 'sanction', 'nato', 'ukraine', 'israel', 'war powers', 'international'] },
  { area: 'energy', patterns: ['energy', 'oil', 'natural gas', 'pipeline', 'drilling', 'renewable', 'solar', 'nuclear', 'emission', 'climate', 'clean air', 'clean water', 'pollution', 'public lands', 'wildlife', 'national monument', 'epa'] },
  { area: 'justice', patterns: ['crime', 'criminal', 'law enforcement', 'police', 'prison', 'sentencing', 'firearm', 'gun ', 'civil rights', 'discrimination', 'voting rights', 'fbi ', 'attorney general'] },
  { area: 'education', patterns: ['education', 'school', 'student', 'university', 'college', 'labor', 'worker', 'wage', 'union', 'osha', 'employment'] },
  { area: 'agriculture', patterns: ['agriculture', 'farm', 'usda', 'crop', 'snap benefits', 'nutrition', 'food safety'] },
  { area: 'finance', patterns: ['bank', 'financial', 'securities', 'crypto', 'digital asset', 'housing', 'mortgage', 'consumer financial'] },
  { area: 'technology', patterns: ['technology', 'artificial intelligence', 'broadband', 'internet', 'cyber', 'nasa', 'spectrum', 'highway', 'railroad', 'aviation', 'infrastructure', 'transportation'] },
  { area: 'economy', patterns: ['appropriation', 'budget', 'debt limit', 'debt ceiling', 'deficit', 'tax', 'tariff', 'irs', 'revenue', 'continuing resolution', 'reconciliation', 'shutdown', 'spending'] },
  { area: 'government', patterns: ['election', 'federal agency', 'inspector general', 'oversight', 'civil service', 'government operations', 'district of columbia'] },
];

/** Wording that describes floor mechanics rather than a subject. */
const PROCEDURAL_PATTERNS = [
  'previous question',
  'motion to adjourn',
  'motion to proceed',
  'motion to table',
  'motion to recommit',
  'motion to discharge',
  'quorum',
  'journal',
  'invoke cloture',
  'legislative session',
  'executive session',
];

function lower(value) {
  return String(value || '').toLowerCase();
}

function matchKeywords(text) {
  if (!text) return null;
  for (const { area, patterns } of KEYWORD_RULES) {
    for (const p of patterns) {
      if (text.includes(p)) return area;
    }
  }
  return null;
}

function areaFromTopic(topic) {
  const key = lower(topic).trim();
  if (!key || key === 'procedural') return null;
  return TOPIC_TO_AREA[key] || null;
}

/**
 * Assign one roll call to a policy area.
 *
 * @returns {{ areaId: string|null, source: 'topic'|'bill'|'question'|'procedural'|'unclassified' }}
 */
export function classifyVote(vote, { billsById = {} } = {}) {
  if (!vote) return { areaId: null, source: 'unclassified' };

  const question = lower(vote.question);

  /**
   * Floor mechanics are settled from the question alone, before any subject is
   * considered. A cloture motion or a motion to table names the measure it is
   * aimed at, and the fetch script copies that bill's policy area onto the vote,
   * so a later check would let those votes through as if they were votes on the
   * measure itself.
   */
  if (PROCEDURAL_PATTERNS.some(p => question.includes(p))) {
    return { areaId: null, source: 'procedural' };
  }

  const fromTopic = areaFromTopic(vote.topic);
  if (fromTopic) return { areaId: fromTopic, source: 'topic' };

  const bill = vote.billId ? billsById[vote.billId] : null;
  const fromBill = areaFromTopic(bill?.policyArea);
  if (fromBill) return { areaId: fromBill, source: 'bill' };

  const text = `${question} ${lower(bill?.title)}`.trim();
  const fromText = matchKeywords(text);
  if (fromText) return { areaId: fromText, source: 'question' };

  if (lower(vote.topic) === 'procedural') return { areaId: null, source: 'procedural' };
  return { areaId: null, source: 'unclassified' };
}

function side(cast) {
  const c = lower(cast).trim();
  if (c === 'yea' || c === 'aye' || c === 'yes') return 'yea';
  if (c === 'nay' || c === 'no') return 'nay';
  return null;
}

function bucket(party) {
  const p = lower(party);
  if (p.startsWith('d')) return 'democratic';
  if (p.startsWith('r')) return 'republican';
  if (p.startsWith('i')) return 'independent';
  return null;
}

/**
 * Party tallies recomputed from the individual member votes.
 *
 * The stored `partyBreakdown` on House roll calls files every member under
 * `democratic`, so it cannot be used to tell the parties apart.
 */
export function tallyPartyVotes(memberVotes) {
  const tally = {
    democratic: { yea: 0, nay: 0 },
    republican: { yea: 0, nay: 0 },
    independent: { yea: 0, nay: 0 },
  };
  for (const mv of memberVotes || []) {
    const b = bucket(mv.party);
    const s = side(mv.voteCast);
    if (!b || !s) continue;
    tally[b][s]++;
  }
  return tally;
}

export function majoritySide(tally) {
  if (!tally) return null;
  const yea = tally.yea || 0;
  const nay = tally.nay || 0;
  if (yea === nay || yea + nay === 0) return null;
  return yea > nay ? 'yea' : 'nay';
}

/**
 * A roll call separates the parties when both have a clear majority and those
 * majorities disagree. Lopsided votes say nothing about where a member stands
 * relative to their party, so only these count toward the area scores.
 */
export function isContestedVote(memberVotes) {
  const tally = tallyPartyVotes(memberVotes);
  const dem = majoritySide(tally.democratic);
  const rep = majoritySide(tally.republican);
  return Boolean(dem && rep && dem !== rep);
}

function round(value, places = 1) {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/**
 * Build the whole index.
 *
 * @param votes  Full roll-call records, each with `memberVotes`.
 * @param members Roster rows (bioguideId, name, party, chamber, state).
 * @param billsById Bill records keyed by billId, for the policy-area join.
 * @param minAreaVotes Areas with fewer contested roll calls are dropped.
 * @param minMemberVotes Members with fewer votes in an area are left out of it.
 */
export function buildPolicyIndex(votes, members, {
  billsById = {},
  minAreaVotes = 4,
  minMemberVotes = 3,
} = {}) {
  const roster = new Map();
  for (const m of members || []) {
    if (!m?.bioguideId) continue;
    roster.set(m.bioguideId, {
      id: m.bioguideId,
      name: m.name,
      party: bucket(m.party) || 'other',
      chamber: m.chamber,
      state: m.state,
    });
  }

  const areaState = new Map();
  for (const area of POLICY_AREAS) {
    areaState.set(area.id, {
      ...area,
      votes: { total: 0, contested: 0, house: 0, senate: 0 },
      partySupport: {
        democratic: { yea: 0, nay: 0 },
        republican: { yea: 0, nay: 0 },
      },
      examples: [],
      scores: new Map(),
    });
  }

  const coverage = { total: 0, classified: 0, contested: 0, procedural: 0, unclassified: 0, bySource: {} };

  for (const vote of votes || []) {
    coverage.total++;
    const { areaId, source } = classifyVote(vote, { billsById });
    coverage.bySource[source] = (coverage.bySource[source] || 0) + 1;
    if (!areaId || !AREA_IDS.has(areaId)) {
      if (source === 'procedural') coverage.procedural++;
      else coverage.unclassified++;
      continue;
    }
    coverage.classified++;

    const area = areaState.get(areaId);
    area.votes.total++;

    const tally = tallyPartyVotes(vote.memberVotes);
    const demSide = majoritySide(tally.democratic);
    const repSide = majoritySide(tally.republican);
    if (!demSide || !repSide || demSide === repSide) continue;

    coverage.contested++;
    area.votes.contested++;
    if (vote.chamber === 'Senate') area.votes.senate++;
    else if (vote.chamber === 'House') area.votes.house++;

    area.partySupport.democratic[demSide]++;
    area.partySupport.republican[repSide]++;
    if (area.examples.length < 8) {
      area.examples.push({
        voteId: vote.voteId,
        date: vote.date,
        chamber: vote.chamber,
        question: vote.question,
        result: vote.result,
        democratic: demSide,
        republican: repSide,
      });
    }

    for (const mv of vote.memberVotes || []) {
      const person = roster.get(mv.bioguideId);
      if (!person) continue;
      const cast = side(mv.voteCast);
      if (!cast) continue;
      let score = area.scores.get(person.id);
      if (!score) {
        score = { n: 0, yea: 0, withRepublicans: 0 };
        area.scores.set(person.id, score);
      }
      score.n++;
      if (cast === 'yea') score.yea++;
      if (cast === repSide) score.withRepublicans++;
    }
  }

  const areas = [];
  const usedMembers = new Set();

  for (const area of areaState.values()) {
    if (area.votes.contested < minAreaVotes) continue;

    const scores = [];
    for (const [id, score] of area.scores) {
      if (score.n < minMemberVotes) continue;
      usedMembers.add(id);
      scores.push({
        id,
        n: score.n,
        // Share of the area's contested measures the member backed.
        support: round((score.yea / score.n) * 100),
        // −100 = always with the Democratic majority, +100 = always with the Republican one.
        lean: round(((score.withRepublicans / score.n) * 2 - 1) * 100),
      });
    }
    scores.sort((a, b) => a.lean - b.lean || a.id.localeCompare(b.id));

    const demTotal = area.partySupport.democratic.yea + area.partySupport.democratic.nay;
    const repTotal = area.partySupport.republican.yea + area.partySupport.republican.nay;

    areas.push({
      id: area.id,
      label: area.label,
      description: area.description,
      votes: area.votes,
      /** How often each party's majority backed the measures in this area. */
      partyStand: {
        democratic: demTotal > 0 ? round((area.partySupport.democratic.yea / demTotal) * 100) : null,
        republican: repTotal > 0 ? round((area.partySupport.republican.yea / repTotal) * 100) : null,
      },
      examples: area.examples,
      scores,
    });
  }

  areas.sort((a, b) => b.votes.contested - a.votes.contested || a.label.localeCompare(b.label));

  const memberList = [];
  for (const [id, person] of roster) {
    if (usedMembers.has(id)) memberList.push(person);
  }
  memberList.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return { areas, members: memberList, coverage, minAreaVotes, minMemberVotes };
}

/** Mean score for one party within an area, for a chamber scope. */
export function partyAverage(area, membersById, { party, chamber = 'all', metric = 'support' } = {}) {
  let sum = 0;
  let n = 0;
  for (const score of area?.scores || []) {
    const person = membersById[score.id];
    if (!person || person.party !== party) continue;
    if (chamber !== 'all' && person.chamber !== chamber) continue;
    sum += score[metric];
    n++;
  }
  return n > 0 ? { avg: round(sum / n), members: n } : { avg: null, members: 0 };
}

/** The party a member is measured against: independents caucus with the Democrats. */
function homeParty(party) {
  return party === 'independent' ? 'democratic' : party;
}

function opposingParty(party) {
  return homeParty(party) === 'democratic' ? 'republican' : 'democratic';
}

/**
 * One member's stance in every area they have a record in, next to their own
 * party and the other one.
 *
 * Averages are taken within the member's own chamber: the House and the Senate
 * vote on different measures, so a senator's 40% and a representative's 40% are
 * not the same number.
 */
export function memberPolicyProfile(index, bioguideId, { metric = 'support' } = {}) {
  const membersById = {};
  for (const m of index?.members || []) membersById[m.id] = m;

  const member = membersById[bioguideId];
  if (!member) return null;

  const own = homeParty(member.party);
  const other = opposingParty(member.party);
  const chamber = member.chamber;

  const areas = [];
  for (const area of index.areas || []) {
    const score = area.scores.find(s => s.id === bioguideId);
    if (!score) continue;

    /**
     * The reference group is the caucus, not the party label: an independent is
     * measured against the Democrats they sit with, and counts as one of them
     * for a Democrat's average. The member is part of their own party's average,
     * the same way they are part of the party.
     */
    let sum = 0;
    let members = 0;
    let below = 0;
    let tied = 0;
    let peers = 0;
    for (const peer of area.scores) {
      const person = membersById[peer.id];
      if (!person || person.chamber !== chamber || homeParty(person.party) !== own) continue;
      sum += peer[metric];
      members++;
      if (peer.id === bioguideId) continue;
      peers++;
      if (peer[metric] < score[metric]) below++;
      else if (peer[metric] === score[metric]) tied++;
    }
    const ownAvg = members > 0 ? { avg: round(sum / members), members } : { avg: null, members: 0 };
    const otherAvg = partyAverage(area, membersById, { party: other, chamber, metric });

    areas.push({
      id: area.id,
      label: area.label,
      description: area.description,
      votes: chamber === 'Senate' ? area.votes.senate : area.votes.house,
      n: score.n,
      score: score[metric],
      support: score.support,
      lean: score.lean,
      party: own,
      ownParty: { party: own, ...ownAvg, peers },
      otherParty: { party: other, ...otherAvg },
      gap: ownAvg.avg == null ? null : round(score[metric] - ownAvg.avg),
      /**
       * Share of the caucus this member outranks, counting a tie as half. On
       * lopsided areas most of a caucus votes identically, and a strict count
       * would file every one of them at the bottom.
       */
      percentile: peers > 0 ? Math.round(((below + tied / 2) / peers) * 100) : null,
    });
  }

  areas.sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0) || a.label.localeCompare(b.label));

  const withGap = areas.filter(a => a.gap != null);
  const summary = {
    areas: areas.length,
    votes: areas.reduce((sum, a) => sum + a.n, 0),
    avgGap: withGap.length > 0
      ? round(withGap.reduce((sum, a) => sum + Math.abs(a.gap), 0) / withGap.length)
      : null,
    mostIndependent: withGap[0] || null,
    mostAligned: withGap.length > 0 ? withGap[withGap.length - 1] : null,
  };

  return { member, chamber, party: own, metric, areas, summary };
}
