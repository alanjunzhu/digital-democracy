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

export interface PricePoint {
  date: string;
  close: number;
}

export interface CounterfactualScenarios {
  actual: number | null;
  earlier30: number | null;
  later30: number | null;
  inaction: number | null;
  labels: Record<string, string>;
}

/** Result of computeCounterfactuals() in shared/trade-timing.mjs. */
export interface TradeCounterfactuals {
  ok: boolean;
  reason?: string;
  horizonDays?: number;
  /** False while the trade is still inside its forward-return window. */
  horizonComplete?: boolean;
  alternativesComplete?: boolean;
  lastPriceDate?: string | null;
  isPurchase?: boolean;
  isSale?: boolean;
  tradeDate?: string | null;
  scenarios?: CounterfactualScenarios;
  actionAdvantage?: number | null;
  timingAdvantage?: number | null;
  summary?: string;
}

/** Assembled at build time by shared/timing-precompute.mjs. */
export interface PrecomputedTiming {
  prices?: PricePoint[];
  counterfactuals?: TradeCounterfactuals;
}

export interface PortfolioMarker {
  date: string;
  ticker: string;
  type: string;
  isPurchase: boolean;
  amountMid: number;
  amountLabel: string;
  owner: string | null;
  bioguideId?: string | null;
  sector: string | null;
  committeeOverlap: boolean;
  disclosureDate: string | null;
}

export interface PortfolioSummary {
  asOf: string | null;
  endMember: number | null;
  endBenchmark: number | null;
  endCash: number | null;
  endFollower: number | null;
  contributed: number;
  returnPct: number | null;
  benchmarkReturnPct: number | null;
  vsBenchmarkPct: number | null;
  vsCashPct: number | null;
  followerReturnPct: number | null;
  /** Member's edge over the index minus what a filing reader could have captured. */
  disclosureGapPct: number | null;
}

/** Output of buildPortfolioSeries() in shared/portfolio-series.mjs. */
export interface MemberPortfolio {
  ok: true;
  estimated: boolean;
  benchmarkTicker: string;
  contributed: number;
  dates: string[];
  member: number[];
  benchmark: number[];
  cash: number[];
  follower: number[];
  followerCash: number[];
  markers: PortfolioMarker[];
  followerSkipped: number;
  skipped: {
    noPrice: number;
    noAmount: number;
    unmatchedSales: number;
    /** Dated outside the benchmark series, so they could not be simulated. */
    outsideBenchmark: number;
  };
  summary: PortfolioSummary;
}

export interface CongressPortfolioSummary {
  asOf: string | null;
  endAll: number | null;
  endBenchmark: number | null;
  endCash: number | null;
  endCommittee: number | null;
  endCommitteeCash: number | null;
  endCommitteeBenchmark: number | null;
  contributed: number;
  committeeContributed: number;
  allReturnPct: number | null;
  benchmarkReturnPct: number | null;
  cashReturnPct: number;
  committeeReturnPct: number | null;
  committeeBenchmarkReturnPct: number | null;
  allVsBenchmarkPct: number | null;
  committeeVsOwnBenchmarkPct: number | null;
}

/** Output of buildCongressPortfolioSeries() in shared/portfolio-series.mjs. */
export interface CongressPortfolio {
  ok: true;
  estimated: boolean;
  benchmarkTicker: string;
  contributed: number;
  committeeContributed: number;
  dates: string[];
  all: number[];
  benchmark: number[];
  cash: number[];
  committee: number[];
  committeeCash: number[];
  committeeBenchmark: number[];
  skipped: MemberPortfolio['skipped'];
  counts: {
    purchases: number;
    overlapPurchases: number;
    members: number;
    overlapMembers: number;
    exceptional: number;
  };
  members: CongressMemberLine[];
  summary: CongressPortfolioSummary;
}

export interface CongressMemberLine {
  bioguideId: string;
  name: string;
  chamber?: string;
  party?: string;
  /** Growth per dollar invested, aligned to the chart dates. */
  plot: number[];
  returnPct: number | null;
  vsBenchmarkPct: number | null;
  vsAllPct: number | null;
  purchases: number;
  contributed: number;
  thin: boolean;
  exceptional: boolean;
}

// Amendment types (Congress.gov /amendment)

export interface AmendmentSponsor {
  bioguideId: string;
  fullName: string;
  party: string;
  state: string;
}

/** The roll call an amendment action recorded, joined to our stored vote ids. */
export interface AmendmentRecordedVote {
  voteId: string | null;
  chamber: string;
  rollNumber: number;
  sessionNumber: number;
  date?: string;
}

export interface AmendmentSummary {
  amendmentId: string;
  congress: number;
  type: string;
  number: number;
  chamber: 'House' | 'Senate';
  /** Senate amendments carry a purpose; House ones carry a description. */
  purpose?: string;
  description?: string;
  submittedDate?: string;
  proposedDate?: string;
  latestAction?: string;
  latestActionDate?: string;
  sponsor?: AmendmentSponsor | null;
  /** The measure this amendment changes, when it amends a bill. */
  amendedBillId?: string | null;
  amendedBillTitle?: string;
  cosponsorCount?: number;
  recordedVotes?: AmendmentRecordedVote[];
  url: string | null;
}

export interface AmendmentDetail extends AmendmentSummary {
  actions?: { date: string; text: string; type?: string }[];
}

export interface AmendmentsIndex {
  lastUpdated: string;
  congress: number;
  total: number;
  amendments: AmendmentSummary[];
}

// Hearing / committee-meeting types (Congress.gov /committee-meeting)

export type MeetingStatus = 'Scheduled' | 'Canceled' | 'Postponed' | 'Rescheduled';

export interface MeetingLocation {
  room?: string;
  building?: string;
  address?: string;
}

export interface MeetingWitness {
  name?: string;
  position?: string;
  organization?: string;
}

export interface HearingSummary {
  eventId: string;
  congress: number;
  chamber: 'House' | 'Senate' | 'NoChamber';
  type?: string;
  title?: string;
  meetingStatus?: MeetingStatus;
  /** ISO timestamp of the meeting itself, not of the record. */
  date?: string;
  committees: { systemCode: string; name: string }[];
  location?: MeetingLocation;
  relatedBillIds?: string[];
  url: string | null;
}

export interface HearingDetail extends HearingSummary {
  witnesses?: MeetingWitness[];
  videos?: { name?: string; url: string }[];
  meetingDocuments?: { name?: string; url: string; format?: string }[];
}

export interface HearingsIndex {
  lastUpdated: string;
  congress: number;
  total: number;
  hearings: HearingSummary[];
}
