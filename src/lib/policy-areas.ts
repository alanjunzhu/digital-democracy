/**
 * Typed re-exports of the shared policy-area helpers for Astro/React.
 */
export {
  POLICY_AREAS,
  buildPolicyIndex,
  classifyVote,
  isContestedVote,
  majoritySide,
  memberPolicyProfile,
  partyAverage,
  tallyPartyVotes,
} from '../../shared/policy-areas.mjs';

export type PartyKey = 'democratic' | 'republican' | 'independent' | 'other';
export type ChamberScope = 'all' | 'House' | 'Senate';
export type StanceMetric = 'support' | 'lean';

export interface PolicyMember {
  id: string;
  name: string;
  party: PartyKey;
  chamber: string;
  state: string;
}

export interface PolicyScore {
  id: string;
  /** Contested roll calls in this area the member voted on. */
  n: number;
  /** Share of those measures the member backed, 0–100. */
  support: number;
  /** −100 = always with the Democratic majority, +100 = always with the Republican one. */
  lean: number;
}

export interface PolicyVoteExample {
  voteId: string;
  date: string;
  chamber: string;
  question: string;
  result: string;
  democratic: 'yea' | 'nay';
  republican: 'yea' | 'nay';
}

export interface PolicyArea {
  id: string;
  label: string;
  description: string;
  votes: { total: number; contested: number; house: number; senate: number };
  partyStand: { democratic: number | null; republican: number | null };
  examples: PolicyVoteExample[];
  scores: PolicyScore[];
}

export interface PolicyCoverage {
  total: number;
  classified: number;
  contested: number;
  procedural: number;
  unclassified: number;
  bySource: Record<string, number>;
}

export interface PolicyIndex {
  areas: PolicyArea[];
  members: PolicyMember[];
  coverage: PolicyCoverage;
  minAreaVotes: number;
  minMemberVotes: number;
}

export interface PartyStandRef {
  party: PartyKey;
  avg: number | null;
  members: number;
}

export interface MemberAreaStance {
  id: string;
  label: string;
  description: string;
  /** Contested roll calls in this area, in the member's own chamber. */
  votes: number;
  /** How many of them the member voted on. */
  n: number;
  /** The member's score on the metric the profile was built for. */
  score: number;
  support: number;
  lean: number;
  party: PartyKey;
  ownParty: PartyStandRef & { peers: number };
  otherParty: PartyStandRef;
  /** Member minus own-party average, in points; null when the party has no average. */
  gap: number | null;
  /** Share of the caucus in the chamber this member outranks, ties counted as half. */
  percentile: number | null;
}

export interface MemberPolicyProfile {
  member: PolicyMember;
  chamber: string;
  party: PartyKey;
  metric: StanceMetric;
  /** Areas the member has a record in, widest gap from their party first. */
  areas: MemberAreaStance[];
  summary: {
    areas: number;
    votes: number;
    avgGap: number | null;
    mostIndependent: MemberAreaStance | null;
    mostAligned: MemberAreaStance | null;
  };
}
