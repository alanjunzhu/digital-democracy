export function getPartyColor(party: string): string {
  switch (party) {
    case 'Democratic': return '#2563eb';
    case 'Republican': return '#dc2626';
    case 'Independent': return '#7c3aed';
    default: return '#6b7280';
  }
}

export function formatState(stateCode: string): string {
  return STATE_NAMES[stateCode] || stateCode;
}

export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function getMemberPhotoUrl(bioguideId: string): string {
  return `https://bioguide.congress.gov/bioguide/photo/${bioguideId[0]}/${bioguideId}.jpg`;
}

export function getMemberSlug(bioguideId: string): string {
  return bioguideId;
}

export const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia', PR: 'Puerto Rico', GU: 'Guam', VI: 'Virgin Islands',
  AS: 'American Samoa', MP: 'Northern Mariana Islands',
};

export const US_STATES = Object.entries(STATE_NAMES)
  .filter(([code]) => !['DC', 'PR', 'GU', 'VI', 'AS', 'MP'].includes(code))
  .sort(([, a], [, b]) => a.localeCompare(b));

export const TERRITORIES = Object.entries(STATE_NAMES)
  .filter(([code]) => ['DC', 'PR', 'GU', 'VI', 'AS', 'MP'].includes(code))
  .sort(([, a], [, b]) => a.localeCompare(b));

// Bill stage categorization based on latestAction text
export type BillStage = 'Introduced' | 'In Committee' | 'Passed One Chamber' | 'Passed Both Chambers' | 'Signed into Law' | 'Vetoed' | 'Other';

export const BILL_STAGES: BillStage[] = [
  'Introduced',
  'In Committee',
  'Passed One Chamber',
  'Passed Both Chambers',
  'Signed into Law',
  'Vetoed',
];

export function getBillStage(latestAction: string | undefined): BillStage {
  if (!latestAction) return 'Introduced';
  const a = latestAction.toLowerCase();

  // Signed into law
  if (a.includes('became public law') || a.includes('signed by president')) return 'Signed into Law';

  // Vetoed
  if (a.includes('vetoed')) return 'Vetoed';

  // Passed both chambers / presented to president
  if (a.includes('presented to president') || a.includes('resolving differences')) return 'Passed Both Chambers';

  // Passed one chamber - look for passage indicators
  if (
    a.includes('passed senate') || a.includes('passed house') ||
    a.includes('received in the senate') || a.includes('received in the house') ||
    a.includes('message on senate action') || a.includes('message on house action') ||
    a.includes('placed on senate legislative calendar') ||
    a.includes('placed on the union calendar') ||
    a.includes('placed on the house calendar') ||
    a.includes('the chair directed the clerk to notify the senate')
  ) return 'Passed One Chamber';

  // In committee
  if (
    a.includes('referred to') || a.includes('committee') || a.includes('subcommittee') ||
    a.includes('ordered to be reported') || a.includes('reported') ||
    a.includes('hearings held') || a.includes('markup')
  ) return 'In Committee';

  // Default: introduced
  if (a.includes('introduced') || a.includes('sponsor introductory remarks')) return 'Introduced';

  return 'Introduced';
}

export const STAGE_COLORS: Record<BillStage, { bg: string; text: string; dot: string }> = {
  'Introduced': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400' },
  'In Committee': { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  'Passed One Chamber': { bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' },
  'Passed Both Chambers': { bg: 'bg-indigo-100', text: 'text-indigo-800', dot: 'bg-indigo-500' },
  'Signed into Law': { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  'Vetoed': { bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
  'Other': { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
};
