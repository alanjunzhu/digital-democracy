/**
 * Typed re-exports of the shared party-alignment helpers for Astro/React.
 */
export {
  averageAlignmentByParty,
  isPartyLineVote,
  normalizeVoteSide,
  partyBucket,
  partyMajoritySide,
  rankPartyAlignment,
  scoreMemberPartyAlignment,
  summarizePartyLineVotes,
} from '../../shared/party-alignment.mjs';

export type PartyBucket = 'democratic' | 'republican' | 'independent';

export interface PartyTally {
  yea: number;
  nay: number;
  notVoting?: number;
}

export interface VotePartyBreakdown {
  democratic: PartyTally;
  republican: PartyTally;
  independent: PartyTally;
}

export interface AlignmentVoteRef {
  voteId: string;
  voteCast?: string;
  chamber?: string;
  topic?: string | null;
}

export interface MemberAlignment {
  comparable: number;
  withParty: number;
  againstParty: number;
  pct: number | null;
}

export interface ChamberAlignmentRow {
  bioguideId: string;
  name: string;
  party: string;
  chamber: string;
  state: string;
  alignment: MemberAlignment;
}
