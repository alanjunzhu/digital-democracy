interface AlignmentRow {
  bioguideId: string;
  name: string;
  party: string;
  chamber: string;
  state: string;
  alignment: { comparable: number; withParty: number; againstParty: number; pct: number | null };
}

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
    partyLinePct?: number;
    partyLineByChamber?: { chamber: string; total: number; partyLine: number; pct: number }[];
    avgYea: number;
    avgNay: number;
    houseLoyalists?: AlignmentRow[];
    senateLoyalists?: AlignmentRow[];
    houseRebels?: AlignmentRow[];
    senateRebels?: AlignmentRow[];
    avgByParty?: { party: string; avg: number; members: number }[];
  };
  committeeStats: {
    total: number;
    house: number;
    senate: number;
    joint: number;
  };
  baseUrl?: string;
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

function partyColor(party: string) {
  const p = party.toLowerCase();
  if (p.startsWith('d')) return 'text-blue-700';
  if (p.startsWith('r')) return 'text-red-700';
  return 'text-purple-700';
}

function partyBarColor(party: string) {
  const p = party.toLowerCase();
  if (p.startsWith('d') || p === 'democratic') return 'bg-blue-500';
  if (p.startsWith('r') || p === 'republican') return 'bg-red-500';
  return 'bg-purple-500';
}

function AlignmentList({ title, rows, baseUrl }: { title: string; rows: AlignmentRow[]; baseUrl: string }) {
  if (!rows?.length) {
    return (
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">{title}</h4>
        <p className="text-xs text-gray-400">Not enough comparable votes yet.</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-2">{title}</h4>
      <ul className="space-y-1.5">
        {rows.map(row => (
          <li key={row.bioguideId} className="flex items-center gap-2 text-sm">
            <div className="flex-1 min-w-0">
              <a href={`${baseUrl}members/${row.bioguideId}/`} className={`font-medium hover:underline truncate block ${partyColor(row.party)}`}>
                {row.name}
              </a>
              <div className="text-[10px] text-gray-400">{row.state} · {row.alignment.comparable} votes</div>
            </div>
            <div className="w-24">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${partyBarColor(row.party)}`}
                  style={{ width: `${row.alignment.pct ?? 0}%` }}
                />
              </div>
            </div>
            <span className="text-xs font-semibold text-gray-800 w-12 text-right">{row.alignment.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AnalyticsDashboard({ memberStats, billStats, voteStats, committeeStats, baseUrl = '/' }: Props) {
  const maxState = Math.max(...memberStats.stateBreakdown.map(s => s.count), 1);
  const maxPolicy = Math.max(...billStats.byPolicyArea.map(p => p.count), 1);
  const partyLinePct = voteStats.partyLinePct ?? 0;
  const avgByParty = voteStats.avgByParty || [];

  return (
    <div className="space-y-8">
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
          <div className="text-sm text-gray-500 mt-1">Roll Call Votes</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 text-center">
          <div className="text-3xl font-bold text-indigo-600">{partyLinePct}%</div>
          <div className="text-sm text-gray-500 mt-1">Party-Line Votes</div>
        </div>
      </div>

      {/* Party alignment */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Party Alignment</h3>
        <p className="text-sm text-gray-500 mb-5">
          Share of Yea/Nay votes that match the member&apos;s party majority on that roll call.
          Party-line votes are those where Democratic and Republican majorities disagree.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Party-line roll calls</div>
            <div className="text-2xl font-bold text-gray-900">{voteStats.partyLineVotes}</div>
            <div className="text-xs text-gray-500 mt-1">{partyLinePct}% of {voteStats.total} votes</div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden mt-3">
              <div className="h-full bg-indigo-500" style={{ width: `${partyLinePct}%` }} />
            </div>
            {(voteStats.partyLineByChamber || []).length > 0 && (
              <div className="mt-3 space-y-1">
                {voteStats.partyLineByChamber!.map(c => (
                  <div key={c.chamber} className="flex justify-between text-xs text-gray-600">
                    <span>{c.chamber}</span>
                    <span>{c.pct}% ({c.partyLine}/{c.total})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="md:col-span-2 p-4 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-3">Average alignment with party</div>
            {avgByParty.length > 0 ? (
              <div className="space-y-3">
                {avgByParty.map(row => (
                  <div key={row.party} className="flex items-center gap-3">
                    <span className={`text-sm font-medium w-28 capitalize ${partyColor(row.party)}`}>{row.party}</span>
                    <div className="flex-1 h-4 bg-white rounded-full overflow-hidden border border-gray-100">
                      <div className={`h-full ${partyBarColor(row.party)}`} style={{ width: `${row.avg}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-800 w-16 text-right">{row.avg}%</span>
                    <span className="text-[10px] text-gray-400 w-16 text-right">{row.members} members</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Alignment scores will appear after vote data is joined to members.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <AlignmentList title="House — most aligned with party" rows={voteStats.houseLoyalists || []} baseUrl={baseUrl} />
          <AlignmentList title="Senate — most aligned with party" rows={voteStats.senateLoyalists || []} baseUrl={baseUrl} />
          <AlignmentList title="House — least aligned with party" rows={voteStats.houseRebels || []} baseUrl={baseUrl} />
          <AlignmentList title="Senate — least aligned with party" rows={voteStats.senateRebels || []} baseUrl={baseUrl} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Party Composition</h3>
          <div className="space-y-3">
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
