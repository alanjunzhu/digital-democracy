export interface MemberSummary {
  bioguideId: string;
  name: string;
  firstName: string;
  lastName: string;
  party: string;
  state: string;
  district?: number;
  chamber: 'Senate' | 'House';
  imageUrl: string;
  url: string;
  phone?: string;
  website?: string;
  startDate?: string;
}

export interface MemberDetail extends MemberSummary {
  birthDate?: string;
  gender?: string;
  terms: Term[];
  socialMedia?: {
    twitter?: string;
    facebook?: string;
    youtube?: string;
  };
  officeAddress?: string;
  committees?: string[];
  sponsoredBills?: BillSummary[];
}

export interface Term {
  chamber: 'Senate' | 'House';
  startDate: string;
  endDate?: string;
  state: string;
  district?: number;
  party: string;
}

export interface BillSummary {
  congress: number;
  type: string;
  number: number;
  billId: string;
  title: string;
  introducedDate: string;
  sponsor?: {
    bioguideId: string;
    name: string;
    party: string;
    state: string;
  };
  latestAction?: string;
  latestActionDate?: string;
  updateDate?: string;
  originChamber: 'Senate' | 'House';
  policyArea?: string;
  url: string | null;
}

/**
 * A committee referral on a bill. Committee names such as "Judiciary
 * Committee" exist in both chambers, so `systemCode` is what identifies the
 * committee; plain strings come from data fetched before it was recorded.
 */
export interface BillCommitteeRef {
  name: string;
  systemCode?: string;
  chamber?: string;
  type?: string;
  activities?: { name: string; date: string }[];
}

export interface BillDetail extends BillSummary {
  summary?: string;
  cosponsors: number;
  committees?: (string | BillCommitteeRef)[];
  subjects?: string[];
  actions: BillAction[];
  textUrl?: string | null;
}

export interface BillAction {
  date: string;
  text: string;
  chamber?: string;
}

export interface BillsIndex {
  lastUpdated: string;
  congress: number;
  total: number;
  bills: BillSummary[];
}

export interface MembersIndex {
  lastUpdated: string;
  congress: number;
  total: number;
  members: MemberSummary[];
}

// Committee types

export interface CommitteeSummary {
  systemCode: string;
  name: string;
  chamber: 'House' | 'Senate' | 'Joint';
  committeeType?: string;
  isSubcommittee?: boolean;
  parent?: { systemCode: string; name: string };
  /** congress.gov profile page, or null when one cannot be resolved. */
  url: string | null;
  billCount?: number;
  subcommittees?: { systemCode: string; name: string }[];
}

/** Legislation referred to a committee. */
export interface CommitteeBillRef {
  billId: string;
  congress: number;
  type: string;
  number: number;
  relationshipType?: string;
  actionDate?: string;
  url: string | null;
}

export interface CommitteeDetail extends CommitteeSummary {
  officialWebsite?: string;
  bills?: CommitteeBillRef[];
}

export interface CommitteesIndex {
  lastUpdated: string;
  congress: number;
  total: number;
  committees: CommitteeSummary[];
}

// Vote types (House Clerk XML + Senate LIS XML; both sessions)

export interface VoteSummary {
  voteId: string;
  rollCallNumber: number;
  congress: number;
  session: number;
  chamber: 'House' | 'Senate';
  date: string;
  question: string;
  result: string;
  billType?: string;
  billNumber?: number;
  billId?: string;
  partyBreakdown: {
    democratic: { yea: number; nay: number; notVoting: number };
    republican: { yea: number; nay: number; notVoting: number };
    independent: { yea: number; nay: number; notVoting: number };
  };
  totalYea: number;
  totalNay: number;
  topic?: string;
  url: string;
}

export interface MemberVotePosition {
  bioguideId: string;
  name: string;
  party: string;
  state: string;
  voteCast: string;
}

export interface VoteDetail extends VoteSummary {
  description?: string;
  voteType?: string;
  memberVotes?: MemberVotePosition[];
}

export interface VotesIndex {
  lastUpdated: string;
  congress: number;
  total: number;
  votes: VoteSummary[];
}
