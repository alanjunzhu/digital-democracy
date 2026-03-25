import { useState, useMemo } from 'react';
import type { CommitteeSummary } from '../../lib/types';

interface Props {
  committees: CommitteeSummary[];
  baseUrl: string;
}

export default function CommitteeFilter({ committees, baseUrl }: Props) {
  const [search, setSearch] = useState('');
  const [chamber, setChamber] = useState<string>('all');

  const filtered = useMemo(() => {
    return committees.filter(c => {
      if (chamber !== 'all' && c.chamber !== chamber) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [committees, search, chamber]);

  const chamberColor = (ch: string) => {
    if (ch === 'Senate') return 'bg-amber-100 text-amber-800';
    if (ch === 'House') return 'bg-emerald-100 text-emerald-800';
    return 'bg-blue-100 text-blue-800';
  };

  return (
    <div>
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Committee name..."
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
              <option value="Joint">Joint</option>
            </select>
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-500">
          Showing {filtered.length} of {committees.length} committees
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No committees match your filters.</p>
          <button
            onClick={() => { setSearch(''); setChamber('all'); }}
            className="mt-2 text-blue-600 hover:text-blue-800"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <a
              key={c.systemCode}
              href={`${baseUrl}committees/${c.systemCode}/`}
              className="block bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all p-4 group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className={`inline-flex items-center font-medium rounded-full text-xs px-1.5 py-0.5 ${chamberColor(c.chamber)}`}>
                  {c.chamber}
                </span>
                {c.committeeType && (
                  <span className="text-xs text-gray-400">{c.committeeType}</span>
                )}
              </div>
              <h3 className="font-semibold text-sm text-gray-900 group-hover:text-blue-600 transition-colors">
                {c.name}
              </h3>
              {c.subcommittees && c.subcommittees.length > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  {c.subcommittees.length} subcommittee{c.subcommittees.length !== 1 ? 's' : ''}
                </p>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
