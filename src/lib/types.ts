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
  title: string;
  introducedDate?: string;
  latestAction?: string;
  latestActionDate?: string;
}

export interface MembersIndex {
  lastUpdated: string;
  congress: number;
  total: number;
  members: MemberSummary[];
}
