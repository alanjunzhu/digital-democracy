import { useState, useMemo } from 'react';
import type { MemberSummary } from '../../lib/types';
import { FINANCE_FILTERS, matchesFinanceFilter } from '../../../shared/member-finance-index.mjs';

interface FinanceEntry {
  trades: number;
  purchases: number;
  sales: number;
  filings: number;
  overlapTrades: number;
  flagged: boolean;
  chartable: boolean;
}

interface Props {
  members: MemberSummary[];
  financeIndex?: Record<string, FinanceEntry>;
  baseUrl: string;
}

const STATE_NAMES: Record<string, string> = {
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

export default function MemberFilter({ members, financeIndex = {}, baseUrl }: Props) {
  const [search, setSearch] = useState('');
  const [chamber, setChamber] = useState<string>('all');
  const [party, setParty] = useState<string>('all');
  const [state, setState] = useState<string>('all');
  const [finance, setFinance] = useState<string>('all');

  // Counts sit in the option labels so the cost of each choice is visible before
  // picking it, rather than only after the grid empties out.
  const financeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const key of Object.keys(FINANCE_FILTERS)) {
      counts[key] = members.filter((m) => matchesFinanceFilter(key, financeIndex[m.bioguideId])).length;
    }
    return counts;
  }, [members, financeIndex]);

  const states = useMemo(() => {
    const s = [...new Set(members.map(m => m.state))].sort();
    return s;
  }, [members]);

  const filtered = useMemo(() => {
    return members.filter(m => {
      if (chamber !== 'all' && m.chamber !== chamber) return false;
      if (party !== 'all' && m.party !== party) return false;
      if (state !== 'all' && m.state !== state) return false;
      if (finance !== 'all' && !matchesFinanceFilter(finance, financeIndex[m.bioguideId])) return false;
      if (search) {
        const q = search.toLowerCase();
        const nameMatch = m.name.toLowerCase().includes(q);
        const stateMatch = m.state.toLowerCase().includes(q) ||
          (STATE_NAMES[m.state] || '').toLowerCase().includes(q);
        if (!nameMatch && !stateMatch) return false;
      }
      return true;
    });
  }, [members, search, chamber, party, state, finance, financeIndex]);

  const partyColor = (p: string) => {
    if (p === 'Democratic') return 'bg-blue-100 text-blue-800';
    if (p === 'Republican') return 'bg-red-100 text-red-800';
    return 'bg-purple-100 text-purple-800';
  };

  const partyLabel = (p: string) => p === 'Democratic' ? 'D' : p === 'Republican' ? 'R' : 'I';

  return (
    <div>
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Name or state..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chamber</label>
            <select
              value={chamber}
              onChange={e => setChamber(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border"
            >
              <option value="all">All Chambers</option>
              <option value="Senate">Senate</option>
              <option value="House">House</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Party</label>
            <select
              value={party}
              onChange={e => setParty(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border"
            >
              <option value="all">All Parties</option>
              <option value="Democratic">Democratic</option>
              <option value="Republican">Republican</option>
              <option value="Independent">Independent</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <select
              value={state}
              onChange={e => setState(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border"
            >
              <option value="all">All States</option>
              {states.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="finance-filter">
            Financial records
          </label>
          <select
            id="finance-filter"
            value={finance}
            onChange={e => setFinance(e.target.value)}
            className="w-full sm:max-w-md rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border"
          >
            {Object.entries(FINANCE_FILTERS).map(([key, def]) => (
              <option key={key} value={key}>
                {(def as { label: string }).label} ({financeCounts[key] ?? 0})
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 text-sm text-gray-500">
          Showing {filtered.length} of {members.length} members
        </div>
      </div>

      {/* Results Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No members match your filters.</p>
          <button
            onClick={() => { setSearch(''); setChamber('all'); setParty('all'); setState('all'); setFinance('all'); }}
            className="mt-2 text-blue-600 hover:text-blue-800"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(m => (
            <a
              key={m.bioguideId}
              href={`${baseUrl}members/${m.bioguideId}/`}
              className="block bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all p-4 group"
            >
              <div className="flex items-start gap-3">
                <img
                  src={m.imageUrl}
                  alt={m.name}
                  className="w-16 h-20 object-cover rounded bg-gray-200"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                    {m.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center font-semibold rounded-full text-xs px-1.5 py-0.5 ${partyColor(m.party)}`}>
                      {partyLabel(m.party)}
                    </span>
                    <span className={`inline-flex items-center font-medium rounded-full text-xs px-1.5 py-0.5 ${m.chamber === 'Senate' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {m.chamber}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {STATE_NAMES[m.state] || m.state}
                    {m.chamber === 'House' && m.district ? `, District ${m.district}` : ''}
                  </p>
                  {(() => {
                    const f = financeIndex[m.bioguideId];
                    if (!f) return null;
                    return (
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        {f.trades > 0 && (
                          <span className="inline-flex items-center rounded text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600">
                            {f.trades} trade{f.trades === 1 ? '' : 's'}
                          </span>
                        )}
                        {f.trades === 0 && f.filings > 0 && (
                          <span className="inline-flex items-center rounded text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600">
                            {f.filings} filing{f.filings === 1 ? '' : 's'}
                          </span>
                        )}
                        {f.overlapTrades > 0 && (
                          <span
                            className="inline-flex items-center rounded text-[10px] px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-100"
                            title="Traded in a sector one of their committees oversees"
                          >
                            committee overlap
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
