import { useState, useMemo } from 'react';
import type { BillSummary } from '../../lib/types';
import { getBillStage, BILL_STAGES, STAGE_COLORS, type BillStage } from '../../lib/utils';

interface Props {
  bills: BillSummary[];
  baseUrl: string;
}

export default function BillFilter({ bills, baseUrl }: Props) {
  const [search, setSearch] = useState('');
  const [chamber, setChamber] = useState<string>('all');
  const [policyArea, setPolicyArea] = useState<string>('all');
  const [stage, setStage] = useState<string>('all');
  const [groupByStage, setGroupByStage] = useState(false);

  const policyAreas = useMemo(() => {
    const areas = [...new Set(bills.map(b => b.policyArea).filter(Boolean))].sort();
    return areas as string[];
  }, [bills]);

  // Compute stage for each bill once
  const billsWithStage = useMemo(() => {
    return bills.map(b => ({
      ...b,
      stage: getBillStage(b.latestAction),
    }));
  }, [bills]);

  // Stage counts for the summary
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of billsWithStage) {
      counts[b.stage] = (counts[b.stage] || 0) + 1;
    }
    return counts;
  }, [billsWithStage]);

  const filtered = useMemo(() => {
    return billsWithStage.filter(b => {
      if (chamber !== 'all' && b.originChamber !== chamber) return false;
      if (policyArea !== 'all' && b.policyArea !== policyArea) return false;
      if (stage !== 'all' && b.stage !== stage) return false;
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
  }, [billsWithStage, search, chamber, policyArea, stage]);

  // Group by stage if toggled
  const groupedBills = useMemo(() => {
    if (!groupByStage) return null;
    const groups: Record<string, typeof filtered> = {};
    for (const s of BILL_STAGES) {
      const matching = filtered.filter(b => b.stage === s);
      if (matching.length > 0) groups[s] = matching;
    }
    // Add "Other" if any
    const other = filtered.filter(b => b.stage === 'Other');
    if (other.length > 0) groups['Other'] = other;
    return groups;
  }, [filtered, groupByStage]);

  const partyColor = (p: string) => {
    if (p === 'D') return 'text-blue-700';
    if (p === 'R') return 'text-red-700';
    return 'text-purple-700';
  };

  const BillCard = ({ b }: { b: (typeof billsWithStage)[0] }) => {
    const sc = STAGE_COLORS[b.stage];
    return (
      <a
        href={`${baseUrl}bills/${b.billId}/`}
        className="block bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all p-4 group"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-sm font-semibold text-blue-700 group-hover:text-blue-900">
                {b.type} {b.number}
              </span>
              <span className={`inline-flex items-center font-medium rounded-full text-xs px-1.5 py-0.5 ${b.originChamber === 'Senate' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {b.originChamber}
              </span>
              <span className={`inline-flex items-center rounded-full text-xs px-1.5 py-0.5 font-medium ${sc.bg} ${sc.text}`}>
                {b.stage}
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
    );
  };

  return (
    <div>
      {/* Stage Summary Bar */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Bills by Stage</h3>
          <button
            onClick={() => setGroupByStage(!groupByStage)}
            className={`text-xs px-2 py-1 rounded ${groupByStage ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {groupByStage ? 'Grouped by Stage' : 'Group by Stage'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {BILL_STAGES.map(s => {
            const count = stageCounts[s] || 0;
            if (count === 0) return null;
            const sc = STAGE_COLORS[s];
            const isActive = stage === s;
            return (
              <button
                key={s}
                onClick={() => setStage(isActive ? 'all' : s)}
                className={`inline-flex items-center gap-1.5 rounded-full text-xs px-3 py-1.5 font-medium transition-all ${
                  isActive ? `${sc.bg} ${sc.text} ring-2 ring-offset-1 ring-current` : `${sc.bg} ${sc.text} opacity-80 hover:opacity-100`
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
                {s}: {count}
              </button>
            );
          })}
        </div>
      </div>

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
          {stage !== 'all' && <span className="ml-1"> in stage "{stage}"</span>}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No bills match your filters.</p>
          <button
            onClick={() => { setSearch(''); setChamber('all'); setPolicyArea('all'); setStage('all'); }}
            className="mt-2 text-blue-600 hover:text-blue-800"
          >
            Clear filters
          </button>
        </div>
      ) : groupedBills ? (
        <div className="space-y-8">
          {Object.entries(groupedBills).map(([stageName, stageBills]) => {
            const sc = STAGE_COLORS[stageName as BillStage] || STAGE_COLORS['Other'];
            return (
              <div key={stageName}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-3 h-3 rounded-full ${sc.dot}`} />
                  <h2 className="text-lg font-semibold text-gray-900">{stageName}</h2>
                  <span className="text-sm text-gray-500">({stageBills.length})</span>
                </div>
                <div className="space-y-3">
                  {stageBills.map(b => <BillCard key={b.billId} b={b} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(b => <BillCard key={b.billId} b={b} />)}
        </div>
      )}
    </div>
  );
}
