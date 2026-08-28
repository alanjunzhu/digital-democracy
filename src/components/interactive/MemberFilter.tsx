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

  const partyTone = (p: string) => {
    if (p === 'Democratic') return 'bg-dem-soft text-dem';
    if (p === 'Republican') return 'bg-rep-soft text-rep';
    return 'bg-ind-soft text-ind';
  };

  const partyLabel = (p: string) => p === 'Democratic' ? 'D' : p === 'Republican' ? 'R' : 'I';

  const clearFilters = () => {
    setSearch('');
    setChamber('all');
    setParty('all');
    setState('all');
    setFinance('all');
  };

  return (
    <div>
      {/* Filter bar: borderless cells split by vertical rules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] border-b border-rule">
        <label className="block py-[14px] pr-5 lg:border-r border-rule">
          <span className="field-label block mb-[6px]">Search</span>
          <input
            type="text"
            placeholder="Name or state…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full box-border appearance-none bg-transparent border-none p-0 text-[15px] focus:outline-none placeholder:text-ink-3"
          />
        </label>
        <label className="block py-[14px] px-5 lg:border-r border-rule">
          <span className="field-label block mb-[6px]">Chamber</span>
          <select
            value={chamber}
            onChange={e => setChamber(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">All chambers</option>
            <option value="Senate">Senate</option>
            <option value="House">House</option>
          </select>
        </label>
        <label className="block py-[14px] px-5 lg:border-r border-rule">
          <span className="field-label block mb-[6px]">Party</span>
          <select
            value={party}
            onChange={e => setParty(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">All parties</option>
            <option value="Democratic">Democratic</option>
            <option value="Republican">Republican</option>
            <option value="Independent">Independent</option>
          </select>
        </label>
        <label className="block py-[14px] pl-5">
          <span className="field-label block mb-[6px]">State</span>
          <select
            value={state}
            onChange={e => setState(e.target.value)}
            className="w-full appearance-none bg-transparent border-none p-0 text-[15px] cursor-pointer focus:outline-none"
          >
            <option value="all">All states</option>
            {states.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Count line + Clear */}
      <div className="flex flex-wrap items-center justify-between gap-6 py-3 pb-[22px] border-b border-rule">
        <label className="flex items-center gap-[10px]">
          <span className="field-label">Financial records</span>
          <select
            id="finance-filter"
            value={finance}
            onChange={e => setFinance(e.target.value)}
            className="appearance-none bg-field border border-rule rounded px-[10px] py-[5px] text-[13px] cursor-pointer"
          >
            {Object.entries(FINANCE_FILTERS).map(([key, def]) => (
              <option key={key} value={key}>
                {(def as { label: string }).label} ({financeCounts[key] ?? 0})
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[12px] text-ink-2 tabular">
            Showing {filtered.length} of {members.length}
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="appearance-none bg-transparent border-none p-0 font-mono text-[11px] tracking-[0.06em] uppercase text-accent cursor-pointer underline underline-offset-[3px]"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Results: record-row roster */}
      {filtered.length === 0 ? (
        <div className="py-[72px] text-center border-b border-rule">
          <p className="font-serif text-2xl font-medium mb-[6px]">No members match these filters.</p>
          <p className="text-[14px] text-ink-3 mb-[18px]">
            Try widening the chamber, party or state, or clearing the financial-records cut.
          </p>
          <button
            onClick={clearFilters}
            className="appearance-none bg-ink text-paper border-none rounded px-[18px] py-[9px] text-[13px] font-semibold cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="hidden md:grid grid-cols-[44px_minmax(0,1.5fr)_minmax(0,1fr)_96px_110px] gap-[18px] py-[11px] border-b border-ink">
            <span />
            <span className="field-label">Member</span>
            <span className="field-label">State</span>
            <span className="field-label">Chamber</span>
            <span className="field-label text-right">Disclosures</span>
          </div>
          {filtered.map(m => {
            const f = financeIndex[m.bioguideId];
            const disclosure = !f
              ? '—'
              : f.trades > 0
                ? `${f.trades} trade${f.trades === 1 ? '' : 's'}`
                : f.filings > 0
                  ? `${f.filings} filing${f.filings === 1 ? '' : 's'}`
                  : '—';
            return (
              <a
                key={m.bioguideId}
                href={`${baseUrl}members/${m.bioguideId}/`}
                className="grid grid-cols-[44px_minmax(0,1fr)] md:grid-cols-[44px_minmax(0,1.5fr)_minmax(0,1fr)_96px_110px] gap-[18px] items-center py-[10px] border-b border-rule hover:border-ink-3"
              >
                <img
                  src={m.imageUrl}
                  alt=""
                  className="w-[34px] h-[44px] object-cover rounded-[1px] bg-rule grayscale contrast-[1.05]"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                />
                <span className="flex items-center gap-[10px] min-w-0">
                  <span
                    className={`inline-flex items-center justify-center w-[17px] h-[17px] rounded font-mono text-[10px] font-semibold shrink-0 ${partyTone(m.party)}`}
                  >
                    {partyLabel(m.party)}
                  </span>
                  <span className="font-serif text-[18px] font-medium truncate">{m.name}</span>
                </span>
                <span className="hidden md:block text-[13px] text-ink-2 truncate">
                  {STATE_NAMES[m.state] || m.state}
                  {m.chamber === 'House' && m.district ? `, District ${m.district}` : ''}
                </span>
                <span className="hidden md:block font-mono text-[10.5px] tracking-[0.06em] uppercase text-ink-3">
                  {m.chamber}
                </span>
                <span className="hidden md:flex items-center justify-end gap-2 font-mono text-[11px] text-ink-3 tabular">
                  {f?.overlapTrades ? (
                    <span
                      className="w-[6px] h-[6px] rounded-full bg-accent shrink-0"
                      title="Traded in a sector one of their committees oversees"
                    />
                  ) : null}
                  {disclosure}
                </span>
              </a>
            );
          })}
          <p className="font-mono text-[11px] leading-[1.6] text-ink-3 border-l-2 border-rule pl-3 mt-[14px]">
            A dot marks a member who traded in a sector one of their committees oversees — a reason
            to look closer, not a finding of wrongdoing.
          </p>
        </>
      )}
    </div>
  );
}
