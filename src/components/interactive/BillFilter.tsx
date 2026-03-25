import { useState, useMemo } from 'react';
import type { BillSummary } from '../../lib/types';

interface Props {
  bills: BillSummary[];
  baseUrl: string;
}

export default function BillFilter({ bills, baseUrl }: Props) {
  const [search, setSearch] = useState('');
  const [chamber, setChamber] = useState<string>('all');
  const [policyArea, setPolicyArea] = useState<string>('all');

  const policyAreas = useMemo(() => {
    const areas = [...new Set(bills.map(b => b.policyArea).filter(Boolean))].sort();
    return areas as string[];
  }, [bills]);

  const filtered = useMemo(() => {
    return bills.filter(b => {
      if (chamber !== 'all' && b.originChamber !== chamber) return false;
      if (policyArea !== 'all' && b.policyArea !== policyArea) return false;
      if (search) {
        const q = search.toLowerCase();
        const titleMatch = b.title.toLowerCase().includes(q);
        const idMatch = b.billId.toLowerCase().includes(q);
        const typeMatch = b.type.toLowerCase().includes(q);
        const sponsorMatch = b.sponsor?.name.toLowerCase().includes(q);
        if (!titleMatch && !idMatch && !typeMatch && !sponsorMatch) return false;
      }
      return true;
    });
  }, [bills, search, chamber, policyArea]);

  const partyColor = (p: string) => {
    if (p === 'D') return 'text-blue-700';
    if (p === 'R') return 'text-red-700';
    return 'text-purple-700';
  };

  return (
    <div>
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Title, bill number, or sponsor..."
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Policy Area</label>
            <select
              value={policyArea}
              onChange={e => setPolicyArea(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border"
            >
              <option value="all">All Policy Areas</option>
              {policyAreas.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-500">
          Showing {filtered.length} of {bills.length} bills
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No bills match your filters.</p>
          <button
            onClick={() => { setSearch(''); setChamber('all'); setPolicyArea('all'); }}
            className="mt-2 text-blue-600 hover:text-blue-800"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(b => (
            <a
              key={b.billId}
              href={`${baseUrl}bills/${b.billId}/`}
              className="block bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all p-4 group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-semibold text-blue-700 group-hover:text-blue-900">
                      {b.type} {b.number}
                    </span>
                    <span className={`inline-flex items-center font-medium rounded-full text-xs px-1.5 py-0.5 ${b.originChamber === 'Senate' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {b.originChamber}
                    </span>
                    {b.policyArea && (
                      <span className="inline-flex items-center rounded-full text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600">
                        {b.policyArea}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                    {b.title}
                  </h3>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    {b.sponsor && (
                      <span>
                        Sponsor: <span className={`font-medium ${partyColor(b.sponsor.party)}`}>{b.sponsor.name}</span>
                        {b.sponsor.party && ` (${b.sponsor.party})`}
                      </span>
                    )}
                    {b.introducedDate && (
                      <span>Introduced: {b.introducedDate}</span>
                    )}
                  </div>
                  {b.latestAction && (
                    <p className="text-xs text-gray-400 mt-1 truncate">
                      Latest: {b.latestAction}
                    </p>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
