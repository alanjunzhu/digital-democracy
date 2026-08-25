/**
 * Typed re-exports of the shared policy-area helpers for Astro/React.
 */
export {
  POLICY_AREAS,
  buildPolicyIndex,
  classifyVote,
  isContestedVote,
  majoritySide,
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
