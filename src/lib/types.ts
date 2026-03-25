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
  originChamber: 'Senate' | 'House';
  policyArea?: string;
  url: string;
}

export interface BillDetail extends BillSummary {
  summary?: string;
  cosponsors: number;
  committees?: string[];
  subjects?: string[];
  actions: BillAction[];
  textUrl?: string;
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
  url: string;
  subcommittees?: { systemCode: string; name: string }[];
}

export interface CommitteeDetail extends CommitteeSummary {
  bills?: string[];
}

export interface CommitteesIndex {
  lastUpdated: string;
  congress: number;
  total: number;
  committees: CommitteeSummary[];
}

// Vote types (House only — Senate not available in API v3)

export interface VoteSummary {
  voteId: string;
  rollCallNumber: number;
  congress: number;
  session: number;
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
  url: string;
}

export interface VoteDetail extends VoteSummary {
  description?: string;
  voteType?: string;
}

export interface VotesIndex {
  lastUpdated: string;
  congress: number;
  total: number;
  votes: VoteSummary[];
}
