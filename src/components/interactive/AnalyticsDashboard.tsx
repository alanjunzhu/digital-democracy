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

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-[5px]">
      <span className="text-[12.5px] text-ink-2 w-32 truncate">{label}</span>
      <div className="flex-1 h-1 bg-rule">
        <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11.5px] font-semibold text-ink w-8 text-right tabular">{value}</span>
    </div>
  );
}

function partyTextColor(party: string) {
  const p = party.toLowerCase();
  if (p.startsWith('d')) return 'text-dem';
  if (p.startsWith('r')) return 'text-rep';
  return 'text-ind';
}

function partyBarColor(party: string) {
  const p = party.toLowerCase();
  if (p.startsWith('d') || p === 'democratic') return 'var(--dem)';
  if (p.startsWith('r') || p === 'republican') return 'var(--rep)';
  return 'var(--ind)';
}

function AlignmentList({ title, rows, baseUrl }: { title: string; rows: AlignmentRow[]; baseUrl: string }) {
  if (!rows?.length) {
    return (
      <div>
        <h4 className="field-label mb-2">{title}</h4>
        <p className="text-[12.5px] text-ink-3">Not enough comparable votes yet.</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="field-label mb-2">{title}</h4>
      <div>
        {rows.map(row => (
          <div key={row.bioguideId} className="flex items-center gap-3 py-[6px] border-b border-rule last:border-0">
            <div className="flex-1 min-w-0">
              <a href={`${baseUrl}members/${row.bioguideId}/`} className={`font-medium hover:underline truncate block text-[13px] ${partyTextColor(row.party)}`}>
                {row.name}
              </a>
              <div className="font-mono text-[10px] text-ink-3 mt-[2px]">{row.state} &middot; {row.alignment.comparable} votes</div>
            </div>
            <div className="w-24">
              <div className="h-1 bg-rule">
                <div
                  className="h-full"
                  style={{ width: `${row.alignment.pct ?? 0}%`, background: partyBarColor(row.party) }}
                />
              </div>
            </div>
            <span className="font-mono text-[11.5px] font-semibold text-ink w-12 text-right tabular">{row.alignment.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsDashboard({ memberStats, billStats, voteStats, committeeStats, baseUrl = '/' }: Props) {
  const maxState = Math.max(...memberStats.stateBreakdown.map(s => s.count), 1);
  const maxPolicy = Math.max(...billStats.byPolicyArea.map(p => p.count), 1);
  const partyLinePct = voteStats.partyLinePct ?? 0;
  const avgByParty = voteStats.avgByParty || [];

  return (
    <div>
      <div className="flex flex-wrap items-stretch border border-rule bg-card mt-6 mb-8">
        <div className="flex-1 min-w-[140px] px-5 py-4 border-r border-rule">
          <div className="field-label">Members</div>
          <div className="font-serif text-2xl font-medium tabular mt-2">{memberStats.total}</div>
        </div>
        <div className="flex-1 min-w-[140px] px-5 py-4 border-r border-rule">
          <div className="field-label">Bills tracked</div>
          <div className="font-serif text-2xl font-medium tabular mt-2">{billStats.total}</div>
        </div>
        <div className="flex-1 min-w-[140px] px-5 py-4 border-r border-rule">
          <div className="field-label">Roll call votes</div>
          <div className="font-serif text-2xl font-medium tabular mt-2">{voteStats.total}</div>
        </div>
        <div className="flex-1 min-w-[140px] px-5 py-4">
          <div className="field-label">Party-line votes</div>
          <div className="font-serif text-2xl font-medium tabular mt-2">{partyLinePct}%</div>
        </div>
      </div>

      {/* Party alignment */}
      <div className="pt-8">
        <h3 className="font-serif text-2xl font-medium tracking-[-0.01em] border-t border-ink pt-3 mb-1">Party alignment</h3>
        <p className="text-[13.5px] leading-[1.6] text-ink-2 max-w-prose mb-6">
          Share of Yea/Nay votes that match the member&apos;s party majority on that roll call.
          Party-line votes are those where Democratic and Republican majorities disagree.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="field-label mb-1">Party-line roll calls</div>
            <div className="font-serif text-2xl font-medium tabular">{voteStats.partyLineVotes}</div>
            <div className="text-[11.5px] text-ink-3 mt-1">{partyLinePct}% of {voteStats.total} votes</div>
            <div className="h-1 bg-rule mt-3">
              <div className="h-full bg-ink" style={{ width: `${partyLinePct}%` }} />
            </div>
            {(voteStats.partyLineByChamber || []).length > 0 && (
              <div className="mt-3">
                {voteStats.partyLineByChamber!.map(c => (
                  <div key={c.chamber} className="flex justify-between font-mono text-[11px] text-ink-2 py-[2px]">
                    <span>{c.chamber}</span>
                    <span className="tabular">{c.pct}% ({c.partyLine}/{c.total})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="field-label mb-3">Average alignment with party</div>
            {avgByParty.length > 0 ? (
              <div className="space-y-3">
                {avgByParty.map(row => (
                  <div key={row.party} className="flex items-center gap-3">
                    <span className={`text-[13px] font-medium w-28 capitalize ${partyTextColor(row.party)}`}>{row.party}</span>
                    <div className="flex-1 h-1 bg-rule">
                      <div className="h-full" style={{ width: `${row.avg}%`, background: partyBarColor(row.party) }} />
                    </div>
                    <span className="font-mono text-[13px] font-semibold text-ink w-16 text-right tabular">{row.avg}%</span>
                    <span className="font-mono text-[10px] text-ink-3 w-20 text-right">{row.members} members</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-ink-3">Alignment scores will appear after vote data is joined to members.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
          <AlignmentList title="House — most aligned with party" rows={voteStats.houseLoyalists || []} baseUrl={baseUrl} />
          <AlignmentList title="Senate — most aligned with party" rows={voteStats.senateLoyalists || []} baseUrl={baseUrl} />
          <AlignmentList title="House — least aligned with party" rows={voteStats.houseRebels || []} baseUrl={baseUrl} />
          <AlignmentList title="Senate — least aligned with party" rows={voteStats.senateRebels || []} baseUrl={baseUrl} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 pt-8">
        <div className="pb-8">
          <h3 className="font-serif text-2xl font-medium tracking-[-0.01em] border-t border-ink pt-3 mb-5">Party composition</h3>
          <div className="flex h-1 bg-rule">
            <div className="h-full bg-dem" style={{ width: `${Math.round((memberStats.democratic / memberStats.total) * 100)}%` }} />
            {memberStats.independent > 0 && (
              <div className="h-full bg-ind" style={{ width: `${Math.round((memberStats.independent / memberStats.total) * 100)}%` }} />
            )}
            <div className="h-full bg-rep" style={{ width: `${Math.round((memberStats.republican / memberStats.total) * 100)}%` }} />
          </div>
          <div className="flex justify-between text-[13px] mt-3">
            <span className="text-dem font-semibold">Democratic: {memberStats.democratic}</span>
            {memberStats.independent > 0 && (
              <span className="text-ind font-semibold">Ind: {memberStats.independent}</span>
            )}
            <span className="text-rep font-semibold">Republican: {memberStats.republican}</span>
          </div>
          <div className="border-t border-rule pt-3 mt-4">
            <div className="flex justify-between font-mono text-[11px] text-ink-2">
              <span>Senate: {memberStats.senate}</span>
              <span>House: {memberStats.house}</span>
            </div>
          </div>
        </div>

        <div className="pb-8">
          <h3 className="font-serif text-2xl font-medium tracking-[-0.01em] border-t border-ink pt-3 mb-5">Vote outcomes</h3>
          {voteStats.total > 0 ? (
            <>
              <div className="flex h-1 bg-rule">
                <div className="h-full bg-yea" style={{ width: `${Math.round((voteStats.passed / voteStats.total) * 100)}%` }} />
                <div className="h-full bg-accent" style={{ width: `${Math.round((voteStats.failed / voteStats.total) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[11.5px] font-mono text-ink-3 mt-2">
                <span><span className="text-yea">Agreed</span> {voteStats.passed}</span>
                <span><span className="text-accent">Rejected</span> {voteStats.failed}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-5">
                <div>
                  <div className="font-serif text-2xl font-medium tabular">{Math.round((voteStats.passed / voteStats.total) * 100)}%</div>
                  <div className="field-label mt-1">Pass rate</div>
                </div>
                <div>
                  <div className="font-serif text-2xl font-medium tabular">{voteStats.avgYea}&ndash;{voteStats.avgNay}</div>
                  <div className="field-label mt-1">Avg Yea&ndash;Nay</div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-[13px] text-ink-3">No vote data available yet.</p>
          )}
        </div>

        <div className="pb-8">
          <h3 className="font-serif text-2xl font-medium tracking-[-0.01em] border-t border-ink pt-3 mb-5">Bills by policy area</h3>
          {billStats.byPolicyArea.length > 0 ? (
            <div>
              {billStats.byPolicyArea.slice(0, 12).map(p => (
                <Bar key={p.area} label={p.area} value={p.count} max={maxPolicy} />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">No bill data available yet.</p>
          )}
        </div>

        <div className="pb-8">
          <h3 className="font-serif text-2xl font-medium tracking-[-0.01em] border-t border-ink pt-3 mb-5">Largest delegations</h3>
          {memberStats.stateBreakdown.length > 0 ? (
            <div>
              {memberStats.stateBreakdown.slice(0, 15).map(s => (
                <Bar key={s.state} label={s.state} value={s.count} max={maxState} />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-ink-3">No member data available yet.</p>
          )}
        </div>

        <div className="pb-8">
          <h3 className="font-serif text-2xl font-medium tracking-[-0.01em] border-t border-ink pt-3 mb-5">Committees by chamber</h3>
          <div className="flex h-1 bg-rule">
            {committeeStats.senate > 0 && (
              <div className="h-full bg-ink" style={{ width: `${Math.round((committeeStats.senate / committeeStats.total) * 100)}%` }} />
            )}
            {committeeStats.house > 0 && (
              <div className="h-full bg-ink-3" style={{ width: `${Math.round((committeeStats.house / committeeStats.total) * 100)}%` }} />
            )}
            {committeeStats.joint > 0 && (
              <div className="h-full bg-rule" style={{ width: `${Math.round((committeeStats.joint / committeeStats.total) * 100)}%` }} />
            )}
          </div>
          <div className="flex justify-between text-[13px] mt-3">
            <span className="text-ink font-semibold">Senate: {committeeStats.senate}</span>
            <span className="text-ink-2 font-semibold">House: {committeeStats.house}</span>
            <span className="text-ink-3 font-semibold">Joint: {committeeStats.joint}</span>
          </div>
        </div>

        <div className="pb-8">
          <h3 className="font-serif text-2xl font-medium tracking-[-0.01em] border-t border-ink pt-3 mb-5">Bills by origin chamber</h3>
          {billStats.byChamber.length > 0 ? (
            <>
              <div className="flex h-1 bg-rule">
                {billStats.byChamber.map(c => (
                  <div
                    key={c.chamber}
                    className={c.chamber === 'Senate' ? 'h-full bg-ink' : 'h-full bg-ink-3'}
                    style={{ width: `${Math.round((c.count / billStats.total) * 100)}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between font-mono text-[11px] text-ink-2 mt-2">
                {billStats.byChamber.map(c => (
                  <span key={c.chamber}>{c.chamber}: {c.count}</span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[13px] text-ink-3">No bill data available yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
