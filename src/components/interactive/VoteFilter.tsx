import { useState, useMemo } from 'react';
import type { VoteSummary } from '../../lib/types';

interface Props {
  votes: VoteSummary[];
  baseUrl: string;
}

export default function VoteFilter({ votes, baseUrl }: Props) {
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<string>('all');
  const [chamber, setChamber] = useState<string>('all');
  const [topic, setTopic] = useState<string>('all');

  // Extract unique topics with counts
  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of votes) {
      const t = (v as any).topic || 'Uncategorized';
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .filter(([name]) => name !== 'Uncategorized' && name !== 'Procedural');
  }, [votes]);

  const filtered = useMemo(() => {
    return votes.filter(v => {
      if (result !== 'all' && v.result !== result) return false;
      if (chamber !== 'all' && v.chamber !== chamber) return false;
      if (topic !== 'all') {
        const vTopic = (v as any).topic || 'Uncategorized';
        if (vTopic !== topic) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const questionMatch = v.question.toLowerCase().includes(q);
        const billMatch = v.billId?.toLowerCase().includes(q);
        if (!questionMatch && !billMatch) return false;
      }
      return true;
    });
  }, [votes, search, result, chamber, topic]);

  const results = useMemo(() => {
    return [...new Set(votes.map(v => v.result).filter(Boolean))].sort();
  }, [votes]);

  const houseCount = votes.filter(v => v.chamber === 'House').length;
  const senateCount = votes.filter(v => v.chamber === 'Senate').length;

  const resultColor = (r: string) => {
    if (r === 'Passed' || r === 'Agreed to' || r === 'Confirmed') return 'bg-green-100 text-green-800';
    if (r === 'Failed' || r === 'Rejected' || r === 'Not Sustained') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  const chamberColor = (c: string) => {
    return c === 'Senate' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800';
  };

  const topicColor = (t: string) => {
    const colors: Record<string, string> = {
      'Immigration': 'bg-orange-100 text-orange-700',
      'Armed Forces and National Security': 'bg-slate-100 text-slate-700',
      'Health': 'bg-pink-100 text-pink-700',
      'Taxation': 'bg-emerald-100 text-emerald-700',
      'Economics and Public Finance': 'bg-green-100 text-green-700',
      'Education': 'bg-violet-100 text-violet-700',
      'Energy': 'bg-amber-100 text-amber-700',
      'Environmental Protection': 'bg-teal-100 text-teal-700',
      'Crime and Law Enforcement': 'bg-red-100 text-red-700',
      'International Affairs': 'bg-sky-100 text-sky-700',
      'Nominations': 'bg-indigo-100 text-indigo-700',
    };
    return colors[t] || 'bg-gray-100 text-gray-600';
  };

  const barWidth = (yea: number, nay: number) => {
    const total = yea + nay;
    if (total === 0) return 50;
    return Math.round((yea / total) * 100);
  };

  const clearFilters = () => {
    setSearch('');
    setResult('all');
    setChamber('all');
    setTopic('all');
  };

  return (
    <div>
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Vote question or bill number..."
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
              <option value="all">All Chambers ({votes.length})</option>
              {houseCount > 0 && <option value="House">House ({houseCount})</option>}
              {senateCount > 0 && <option value="Senate">Senate ({senateCount})</option>}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
            <select
              value={topic}
              onChange={e => setTopic(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border"
            >
              <option value="all">All Topics</option>
              {topicCounts.map(([t, count]) => (
                <option key={t} value={t}>{t} ({count})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Result</label>
            <select
              value={result}
              onChange={e => setResult(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border"
            >
              <option value="all">All Results</option>
              {results.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-500">
          Showing {filtered.length} of {votes.length} votes
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No votes match your filters.</p>
          <button
            onClick={clearFilters}
            className="mt-2 text-blue-600 hover:text-blue-800"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(v => (
            <a
              key={v.voteId}
              href={`${baseUrl}votes/${v.voteId}/`}
              className="block bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all p-4 group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-gray-600">
                      #{v.rollCallNumber}
                    </span>
                    <span className={`inline-flex items-center font-medium rounded-full text-xs px-1.5 py-0.5 ${chamberColor(v.chamber || 'House')}`}>
                      {v.chamber || 'House'}
                    </span>
                    <span className={`inline-flex items-center font-medium rounded-full text-xs px-1.5 py-0.5 ${resultColor(v.result)}`}>
                      {v.result}
                    </span>
                    {v.billId && (
                      <span className="text-xs text-blue-600 font-medium">
                        {v.billId.toUpperCase()}
                      </span>
                    )}
                    {(v as any).topic && (
                      <span className={`inline-flex items-center rounded-full text-[10px] px-1.5 py-0.5 font-medium ${topicColor((v as any).topic)}`}>
                        {(v as any).topic}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                    {v.question}
                  </h3>
                  {/* Vote tally bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                      <div
                        className="bg-green-500 h-full"
                        style={{ width: `${barWidth(v.totalYea, v.totalNay)}%` }}
                      />
                      <div
                        className="bg-red-500 h-full"
                        style={{ width: `${100 - barWidth(v.totalYea, v.totalNay)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {v.totalYea}–{v.totalNay}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                    <span>D: {v.partyBreakdown.democratic.yea}–{v.partyBreakdown.democratic.nay}</span>
                    <span>R: {v.partyBreakdown.republican.yea}–{v.partyBreakdown.republican.nay}</span>
                    {(v.partyBreakdown.independent.yea + v.partyBreakdown.independent.nay) > 0 && (
                      <span>I: {v.partyBreakdown.independent.yea}–{v.partyBreakdown.independent.nay}</span>
                    )}
                    {v.date && <span>{v.date}</span>}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
