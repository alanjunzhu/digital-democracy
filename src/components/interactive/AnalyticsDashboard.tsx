import { useMemo } from 'react';

interface Props {
  memberStats: {
    total: number;
    senate: number;
    house: number;
    democratic: number;
    republican: number;
    independent: number;
    stateBreakdown: { state: string; count: number }[];
  };
  billStats: {
    total: number;
    byPolicyArea: { area: string; count: number }[];
    byChamber: { chamber: string; count: number }[];
    recentActivity: { date: string; count: number }[];
  };
  voteStats: {
    total: number;
    passed: number;
    failed: number;
    partyLineVotes: number;
    avgYea: number;
    avgNay: number;
  };
  committeeStats: {
    total: number;
    house: number;
    senate: number;
    joint: number;
  };
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-gray-600 w-32 truncate">{label}</span>
      <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-8 text-right">{value}</span>
    </div>
  );
}

export default function AnalyticsDashboard({ memberStats, billStats, voteStats, committeeStats }: Props) {
  const maxState = useMemo(() => Math.max(...memberStats.stateBreakdown.map(s => s.count), 1), [memberStats]);
  const maxPolicy = useMemo(() => Math.max(...billStats.byPolicyArea.map(p => p.count), 1), [billStats]);

  return (
    <div className="space-y-8">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 text-center">
          <div className="text-3xl font-bold text-gray-900">{memberStats.total}</div>
          <div className="text-sm text-gray-500 mt-1">Members</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 text-center">
          <div className="text-3xl font-bold text-blue-600">{billStats.total}</div>
          <div className="text-sm text-gray-500 mt-1">Bills Tracked</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 text-center">
          <div className="text-3xl font-bold text-emerald-600">{voteStats.total}</div>
          <div className="text-sm text-gray-500 mt-1">House Votes</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 text-center">
          <div className="text-3xl font-bold text-purple-600">{committeeStats.total}</div>
          <div className="text-sm text-gray-500 mt-1">Committees</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Party Composition */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Party Composition</h3>
          <div className="space-y-3">
            {/* Visual bar */}
            <div className="h-8 rounded-full overflow-hidden flex">
              <div className="bg-blue-500 h-full flex items-center justify-center text-xs text-white font-bold"
                style={{ width: `${Math.round((memberStats.democratic / memberStats.total) * 100)}%` }}>
                {memberStats.democratic}
              </div>
              {memberStats.independent > 0 && (
                <div className="bg-purple-500 h-full flex items-center justify-center text-xs text-white font-bold"
                  style={{ width: `${Math.round((memberStats.independent / memberStats.total) * 100)}%` }}>
                  {memberStats.independent}
                </div>
              )}
              <div className="bg-red-500 h-full flex items-center justify-center text-xs text-white font-bold"
                style={{ width: `${Math.round((memberStats.republican / memberStats.total) * 100)}%` }}>
                {memberStats.republican}
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-blue-700 font-semibold">Democratic: {memberStats.democratic}</span>
              {memberStats.independent > 0 && (
                <span className="text-purple-700 font-semibold">Ind: {memberStats.independent}</span>
              )}
              <span className="text-red-700 font-semibold">Republican: {memberStats.republican}</span>
            </div>
            <div className="border-t border-gray-100 pt-3 mt-3">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Senate: {memberStats.senate}</span>
                <span>House: {memberStats.house}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Vote Results */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Vote Outcomes</h3>
          {voteStats.total > 0 ? (
            <div className="space-y-4">
              <div className="h-8 rounded-full overflow-hidden flex">
                <div className="bg-green-500 h-full flex items-center justify-center text-xs text-white font-bold"
                  style={{ width: `${Math.round((voteStats.passed / voteStats.total) * 100)}%` }}>
                  {voteStats.passed} Passed
                </div>
                <div className="bg-red-500 h-full flex items-center justify-center text-xs text-white font-bold"
                  style={{ width: `${Math.round((voteStats.failed / voteStats.total) * 100)}%` }}>
                  {voteStats.failed} Failed
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-600">{Math.round((voteStats.passed / voteStats.total) * 100)}%</div>
                  <div className="text-xs text-gray-500">Pass Rate</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-700">{voteStats.avgYea}–{voteStats.avgNay}</div>
                  <div className="text-xs text-gray-500">Avg Yea–Nay</div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No vote data available yet.</p>
          )}
        </div>

        {/* Bills by Policy Area */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Bills by Policy Area</h3>
          {billStats.byPolicyArea.length > 0 ? (
            <div className="space-y-1">
              {billStats.byPolicyArea.slice(0, 12).map(p => (
                <Bar key={p.area} label={p.area} value={p.count} max={maxPolicy} color="bg-blue-500" />
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No bill data available yet.</p>
          )}
        </div>

        {/* Members by State (top 15) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Largest Delegations</h3>
          {memberStats.stateBreakdown.length > 0 ? (
            <div className="space-y-1">
              {memberStats.stateBreakdown.slice(0, 15).map(s => (
                <Bar key={s.state} label={s.state} value={s.count} max={maxState} color="bg-indigo-500" />
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No member data available yet.</p>
          )}
        </div>

        {/* Committee Breakdown */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Committees by Chamber</h3>
          <div className="space-y-3">
            <div className="h-8 rounded-full overflow-hidden flex">
              {committeeStats.senate > 0 && (
                <div className="bg-amber-500 h-full flex items-center justify-center text-xs text-white font-bold"
                  style={{ width: `${Math.round((committeeStats.senate / committeeStats.total) * 100)}%` }}>
                  {committeeStats.senate}
                </div>
              )}
              {committeeStats.house > 0 && (
                <div className="bg-emerald-500 h-full flex items-center justify-center text-xs text-white font-bold"
                  style={{ width: `${Math.round((committeeStats.house / committeeStats.total) * 100)}%` }}>
                  {committeeStats.house}
                </div>
              )}
              {committeeStats.joint > 0 && (
                <div className="bg-blue-500 h-full flex items-center justify-center text-xs text-white font-bold"
                  style={{ width: `${Math.round((committeeStats.joint / committeeStats.total) * 100)}%` }}>
                  {committeeStats.joint}
                </div>
              )}
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-amber-700 font-semibold">Senate: {committeeStats.senate}</span>
              <span className="text-emerald-700 font-semibold">House: {committeeStats.house}</span>
              <span className="text-blue-700 font-semibold">Joint: {committeeStats.joint}</span>
            </div>
          </div>
        </div>

        {/* Bills by Chamber */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Bills by Origin Chamber</h3>
          {billStats.byChamber.length > 0 ? (
            <div className="space-y-3">
              <div className="h-8 rounded-full overflow-hidden flex">
                {billStats.byChamber.map(c => (
                  <div
                    key={c.chamber}
                    className={`h-full flex items-center justify-center text-xs text-white font-bold ${c.chamber === 'Senate' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.round((c.count / billStats.total) * 100)}%` }}
                  >
                    {c.chamber}: {c.count}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No bill data available yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
