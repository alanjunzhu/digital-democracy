export function getPartyColor(party: string): string {
  switch (party) {
    case 'Democrat': return '#2563eb';
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
