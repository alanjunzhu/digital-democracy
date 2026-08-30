# Congress Tracker

A free, open-source transparency tool for the **119th United States Congress**. Browse members, track recently active legislation, view roll call votes, inspect committee referrals, and see STOCK Act filings next to committee assignments.

**Live site:** [alanjunzhu.github.io/digital-democracy](https://alanjunzhu.github.io/digital-democracy)

## What this is, in plain terms

Members of Congress have to publicly report their stock trades, and they sit on committees
that oversee particular industries. Both facts are public, but they live in separate places
and neither is easy to read. This site puts them on one page, per member, alongside their
votes and the bills they sponsor.

The part people usually come for: on each member's page you can see **how their disclosed
stock purchases actually performed**, next to what would have happened if the same money
had gone into an ordinary S&P 500 index fund instead, or had not been invested at all.
There is also a line showing how someone copying their trades from the public filings
would have done — the filings appear weeks after the trades, so that line shows how much
of the result depended on acting before anyone else could. The finances page asks the
same question of Congress as a whole, and adds a line for trades in a sector that
member's committee oversees.

Some honest limits, which the site states on the page too:

- **The dollar figures are estimates.** Disclosures report amounts as ranges, like
  "$1,001 – $15,000", not exact numbers. Every trade is modelled at the middle of its range,
  so real positions could be several times bigger or smaller. The percentages are more
  reliable than the dollars.
- **Beating or trailing the market proves nothing.** Members file these reports because the
  law requires it, and most trades are ordinary investing, often made by a financial adviser
  rather than the member. A flagged overlap between a trade and a committee is a reason to
  look closer, not a finding of wrongdoing.
- **Some trades cannot be shown.** Selling something bought before the reporting period
  began leaves nothing to chart, and a few obscure tickers have no price history anywhere.
  Those are counted and named rather than quietly dropped.

Everything below is for people who want to run or modify the site.

---

## How it works

The site is static. Node scripts fetch public data into `data/`, that JSON is committed, and Astro builds pages from it for GitHub Pages.

---

## Features

- **Members** — Directory of current members with photos, party, state, and chamber, filterable by whether they have a trading record; profiles with contact info, service history, sponsored bills by stage, votes by topic, committee assignments, and financial filings
- **Bills** — The most recently *updated* measures (not the oldest introductions), filterable by stage, with committee referrals that distinguish House from Senate committees of the same name
- **Votes** — House and Senate roll calls for both sessions of the 119th Congress, filterable by chamber and topic; where a roll call decided an amendment, the vote page names it — the Clerk titles those votes only "On Agreeing to the Amendment"
- **Amendments** — Amendments offered to legislation, with the bill each one changes, the member who offered it, and the roll call taken on it. Dispositions are read from the action wording, so "not agreed to" is not mistaken for "agreed to"
- **Committees** — Standing committees and subcommittees, each listing legislation referred to it in this congress and the meetings it has scheduled or held
- **Hearings** — Committee hearings and markups, with status, room, witnesses and the bills at issue. A markup is labelled as a markup rather than filed under hearings, and the schedule states the date it was read rather than claiming to be live
- **Finances** — STOCK Act periodic transaction reports (and ticker-level trades when the Stock Watcher dumps are reachable), with a Congress-wide chart of cash vs all trading vs the S&P 500 vs committee-overlap trades, plus committee-overlap and bill-timing flags
- **Analytics** — Party breakdown, bill stages, and voting patterns
- **Section index** — The long pages (member, bill, vote and committee profiles, and the trading dashboard) carry an "On this page" rail on the left, opened and closed by the gearwheel in the left margin, that jumps to a section and marks the one being read. It docks in the gutter on wide screens and opens over the text on narrow ones
- **Light and dark** — A theme toggle in the utility strip, remembered in `localStorage` and applied before first paint so there is no flash
- **Automated refresh** — GitHub Actions fetch and commit data on a schedule; a push to `main` rebuilds the site

---

## Design system

The site is set like a public record rather than a dashboard: newsroom typography on a
warm paper ground, hairline rules instead of cards, and monospace reserved for anything a
reader might want to verify. The tokens live in `src/styles/global.css` and are surfaced to
Tailwind in `tailwind.config.mjs`, so `bg-paper`, `border-rule` and `text-ink-2` work in
class lists.

### Tokens

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--paper` | `#f7f6f3` | `#14140f` | Page ground. Warm, never pure white |
| `--card` | `#fffefb` | `#1b1a16` | Tiles and panels sitting on paper |
| `--ink` | `#1a1a18` | `#f2f0e9` | Headlines, figures, primary button, section rules |
| `--ink-2` | `#4a473f` | `#c2bdb1` | Body copy, nav at rest |
| `--ink-3` | `#7d786d` | `#8e887b` | Mono metadata, captions, hover rule |
| `--rule` | `#e2dfd7` | `#2f2d26` | Every hairline, grid gap, bar track |
| `--red` | `#8a1c1c` | `#d2635a` | Eyebrows, identifiers, hover, Nay, caveats |
| `--navy` | `#1f3d5c` | `#8fb4d6` | Yea, Agreed, focus ring, affirmative status |
| `--dem` / `--rep` / `--ind` | `#2563eb` / `#dc2626` / `#7c3aed` | lightened | Party series and party marks |

Party hues are data, not brand, and are unchanged from the original site so existing charts
and legends stay correct. **Red is the interface accent and navy is Yea** — neither is ever
used for party meaning.

### Type

Three families, each with one job:

- **Newsreader** (400/500 only, never bold) — display, page titles, section and record headings
- **Public Sans** — interface and prose; body caps at 66ch, headlines at 24ch
- **IBM Plex Mono** — identifiers, dates, tallies, counts, field labels. Prose never uses it

Any figure in a column or that updates gets `font-variant-numeric: tabular-nums` (the
`.tabular` helper).

### Layout

1200px measure, 40px gutters, a 4px spacing step. Radius is 2px everywhere or 0; nothing is
pill-shaped except a 6px status dot. **There are no box-shadows** — depth comes from the
paper/card value difference and from rules. Tiles use a 1px-gap grid on a `--rule`
background so the gap reads as a hairline (`.tile-grid`).

### Chart theme

One vocabulary for every graph. Colour marks the *series*, not the value — gains never turn
green and losses never turn red:

| Role | Mark |
| --- | --- |
| Subject | 2px solid ink — the thing the chart is about |
| Benchmark | 1.5px navy, 5-4 dash — always dashed, so it reads as counterfactual |
| Do-nothing baseline | 1px `--ink-3`, 2-3 dot — cash or no-change, flat at the axis |
| Flagged series | 2px red — only the committee-overlap cut |
| Cohort behind | 1px rule-grey, drawn first, unlabelled — texture, not data to read off |
| Bars | 4px for inline tallies, square ends, rule-grey track. Never rounded, never gradient |
| Gridlines | 1px rule horizontals, zero line in `--ink-3`. No vertical gridlines, no chart border |

**Axis and series labels are HTML in a gutter beside the plot, never SVG `<text>`.** That
keeps them selectable, themable, and immune to viewBox scaling — the charts use
`preserveAspectRatio="none"`, which would otherwise stretch any text inside them.

### Voice

| Do | Don't |
| --- | --- |
| "Agreed" or "Rejected", with the tally beside it | Green and red pills that read as good and bad news |
| "Estimated at the disclosed midpoint" | A precise-looking dollar figure with no qualifier |
| "Traded in a sector their committee oversees" | "Suspicious trade", or any word implying a finding |
| "Roll calls through 30 Jul 2026" | "Live" or "real-time" when the build is scheduled |

Estimates, midpoints and flags carry their caveat in the same view — a note with a red left
rule for a limit on what the data can support, a grey one for coverage or freshness.

---

## Data Sources

| Source | Used for |
|--------|----------|
| [Congress.gov API v3](https://api.congress.gov/) | Members, bills (sorted `updateDate+desc`), committees, committee legislation, amendments, committee meetings |
| [unitedstates/congress-legislators](https://unitedstates.github.io/congress-legislators/) | Names, websites, social links, committee memberships (`github.io` first; `theunitedstates.io` as fallback) |
| [clerk.house.gov](https://clerk.house.gov/legislative/legvotes.aspx) | House roll call XML |
| [senate.gov](https://www.senate.gov/legislative/votes_new.htm) | Senate roll call XML |
| [House Clerk disclosures](https://disclosures-clerk.house.gov/) | STOCK Act periodic transaction reports when House Stock Watcher S3 is closed |
| [House Stock Watcher](https://housestockwatcher.com/) | House trades with tickers (when the S3 dump is reachable) |
| [Senate Stock Watcher](https://senatestockwatcher.com/) | Senate trades with tickers (when the S3 dump is reachable) |
| [CongressWatch](https://congresswatch.vercel.app/) | Public PTR aggregate with tickers + bioguide ids (fallback when Stock Watcher S3 is closed) |
| [Kadoa congress-trading-monitor](https://github.com/kadoa-org/congress-trading-monitor) | Parsed House/Senate PTR trades from official Clerk + eFD filings (public JSON) |
| [Senate eFD](https://efdsearch.senate.gov/) | Official Senate financial disclosure search (PTR filing index when reachable) |

Votes, finances, and the unitedstates files need no Congress.gov key. Members, bills, and committees do.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Pages | [Astro 5](https://astro.build/) (static) |
| Filters / search | [React 19](https://react.dev/) + [Fuse.js](https://www.fusejs.io/) |
| Styles | [Tailwind CSS 3](https://tailwindcss.com/) over CSS-variable design tokens |
| Type | Newsreader · Public Sans · IBM Plex Mono ([Google Fonts](https://fonts.google.com/)) |
| Hosting | [GitHub Pages](https://pages.github.com/) at `/digital-democracy/` |
| CI | [GitHub Actions](https://github.com/features/actions) |

---

## Project Structure

```
digital-democracy/
├── src/
│   ├── pages/
│   │   ├── index.astro                  # Home
│   │   ├── analytics.astro              # Dashboard
│   │   ├── members/
│   │   │   ├── index.astro              # Directory
│   │   │   └── [bioguideId].astro       # Profile (bills, votes, committees, finances)
│   │   ├── bills/
│   │   │   ├── index.astro              # Tracker
│   │   │   └── [billId].astro           # Detail
│   │   ├── votes/
│   │   │   ├── index.astro              # Roll call list
│   │   │   └── [voteId].astro           # Member positions + amendment at issue
│   │   ├── amendments/
│   │   │   ├── index.astro              # Amendment list
│   │   │   └── [amendmentId].astro      # Bill amended, sponsor, roll calls, actions
│   │   ├── hearings/
│   │   │   ├── index.astro              # Committee meeting schedule
│   │   │   └── [eventId].astro          # Witnesses, documents, bills at issue
│   │   └── committees/
│   │       ├── index.astro              # Directory
│   │       └── [committeeId].astro      # Referrals + subcommittees + meetings
│   ├── components/
│   │   ├── layout/                      # Layout, Header, Footer, PageIndex
│   │   ├── shared/                      # PartyBadge, ChamberBadge
│   │   ├── members/                     # MemberCard
│   │   └── interactive/                 # React filters and analytics
│   │       ├── MemberFilter.tsx
│   │       ├── BillFilter.tsx
│   │       ├── VoteFilter.tsx
│   │       ├── AmendmentFilter.tsx
│   │       ├── HearingFilter.tsx
│   │       ├── CommitteeFilter.tsx
│   │       ├── MemberPortfolioChart.tsx
│   │       ├── CongressPortfolioChart.tsx
│   │       └── AnalyticsDashboard.tsx
│   ├── lib/
│   │   ├── types.ts                     # Shared TypeScript types
│   │   ├── utils.ts                     # Bill stages, vote outcomes, state names, formatting
│   │   ├── committees.ts                # Resolve referrals by systemCode
│   │   └── committee-bills.ts           # Group stored bills onto committee pages
│   └── styles/
│       └── global.css                   # Design tokens (light + dark) and shared helpers
├── scripts/
│   ├── fetch-members.mjs                # Congress.gov members + legislator bios
│   ├── fetch-bills.mjs                  # Recently updated bills + sub-resources
│   ├── fetch-committees.mjs             # Committees + referred legislation
│   ├── fetch-votes.mjs                  # House + Senate XML (both sessions)
│   ├── fetch-amendments.mjs             # Amendments + actions, joined to bills and roll calls
│   ├── fetch-hearings.mjs               # Committee meetings (schedule, not transcripts)
│   ├── fetch-finances.mjs               # Trades / PTR filings + conflict flags
│   ├── fetch-stock-prices.mjs           # Daily closes per traded ticker -> data/prices/
│   ├── enrich-trade-timing.mjs          # Counterfactuals from the price cache (no network)
│   ├── fix-data-urls.mjs                # Rebuild stored congress.gov URLs (no API)
│   ├── backfill-member-bio.mjs          # Refill names/websites/socials (no API key)
│   ├── commit-data.sh                   # Publish regenerated data without rebase races
│   ├── repair-vote-records.mjs          # Map Senate LIS ids and fix bill citations (no API)
│   └── lib/
│       ├── api-client.mjs               # Retry, pagination, batch fetch, User-Agent
│       ├── data-writer.mjs              # Read/write under data/ (or CONGRESS_DATA_DIR)
│       └── unitedstates.mjs             # Legislator hosts + committee-membership map
├── shared/
│   ├── congress-urls.mjs                # Bill and committee URL builders (scripts + pages)
│   ├── stock-prices.mjs                 # Yahoo chart parsing and forward returns
│   ├── price-cache.mjs                  # Compact per-ticker price files
│   ├── trade-timing.mjs                 # Counterfactual scenarios and trade context
│   ├── timing-precompute.mjs            # Build-time pairing of chart data to trades
│   ├── portfolio-series.mjs             # Member and Congress portfolios vs S&P 500 vs cash
│   ├── member-finance-index.mjs         # Per-member trading record for the directory filter
│   ├── vote-outcome.mjs                 # Reads a roll-call result string as agreed/rejected
│   ├── amendment-outcome.mjs            # Reads an amendment's latest action as its disposition
│   ├── meeting-status.mjs               # Meeting labels, ordering, and upcoming/past
│   ├── page-index.mjs                   # Section lists for the on-page index rail
│   └── data-loader.mjs                  # Memoised reads of the shared data indexes
├── tests/                               # node --test
│   ├── api-client.test.mjs
│   ├── commit-data.test.mjs
│   ├── congress-urls.test.mjs
│   ├── fetch-normalize.test.mjs
│   ├── fetch-pipeline.test.mjs
│   ├── finances.test.mjs
│   ├── members.test.mjs
│   ├── unitedstates.test.mjs
│   ├── vote-outcome.test.mjs
│   └── votes.test.mjs
├── data/                                # Generated JSON, committed
│   ├── members/                         # index.json + {bioguideId}.json
│   ├── bills/                           # index.json + {billId}.json
│   ├── votes/                           # index.json + {voteId}.json + by-member.json
│   ├── committees/                      # index.json + {systemCode}.json
│   ├── finances/                        # by-member.json + trade-timing.json
│   ├── prices/                          # {TICKER}.json daily closes
│   └── meta/                            # last-updated.json
├── .github/workflows/
│   ├── deploy.yml                       # Test, build, deploy Pages on push to main
│   ├── ci.yml                           # Tests, typecheck, and Astro build on pull requests
│   ├── fetch-members.yml                # Weekly full fetch (sequential; bills, finances, prices, timing)
│   ├── fetch-prices.yml                 # Prices + trade timing only (Mon, or on demand)
│   ├── fetch-bills.yml                  # Bills only (Mon/Thu)
│   └── fetch-votes.yml                  # Votes only (Tue/Fri)
├── public/
│   └── favicon.svg
├── astro.config.mjs
└── package.json
```

`shared/congress-urls.mjs` is the single place bill and committee links are built, so resolutions go to `/house-resolution/n` rather than `/house-bill/n`, and committees go to `/committee/{chamber}-{slug}/{systemCode}`.

---

## Getting Started

### Prerequisites

- [Node.js 22+](https://nodejs.org/)
- A free [Congress.gov API key](https://api.congress.gov/sign-up/) for members, bills, and committees

### Local Development

```bash
git clone https://github.com/alanjunzhu/digital-democracy.git
cd digital-democracy
npm install
```

Committed JSON in `data/` is enough to run the site:

```bash
npm run dev
```

Open [http://localhost:4321/digital-democracy/](http://localhost:4321/digital-democracy/).

To refresh data:

```bash
CONGRESS_API_KEY=your_key_here npm run fetch:members
CONGRESS_API_KEY=your_key_here npm run fetch:bills
CONGRESS_API_KEY=your_key_here npm run fetch:committees
npm run fetch:votes
npm run fetch:finances
```

| Variable | Used by |
|----------|---------|
| `CONGRESS_API_KEY` | `fetch-members`, `fetch-bills`, `fetch-committees` |
| `CONGRESS_API_BASE_URL` | Tests / pointing the API client at a stand-in |
| `CONGRESS_DATA_DIR` | Tests / writing JSON somewhere other than `data/` |

Repair scripts that do not call Congress.gov:

```bash
node scripts/backfill-member-bio.mjs    # names, websites, socials from congress-legislators
node scripts/fix-data-urls.mjs          # rewrite stored congress.gov URLs
```

### Tests

```bash
npm test
```

Covers URL builders, fetch normalization, an end-to-end fetch against a stand-in API, member
name preservation, committee-membership mapping, Clerk PTR parsing, vote probing, roll-call
outcome classification, HTTP client behavior, and `commit-data.sh` races.

### Production Build

```bash
npm run build
npm run preview
```

---

## CI/CD

All five data workflows check out `main`, write JSON, and publish with `scripts/commit-data.sh`. They share the `fetch-data` concurrency group (`cancel-in-progress: false`) so they queue instead of overlapping. If `main` still moves during a run, the script resets to the latest `main` and reapplies only the paths that job owns, instead of rebasing and failing on aggregate files like `data/bills/index.json`.

| Workflow | Schedule | What it writes |
|----------|----------|----------------|
| **CI** (`ci.yml`) | Pull requests | `npm test`, `tsc`, `astro build` |
| **Fetch Congress Data** (`fetch-members.yml`) | Sunday 02:00 UTC | All of `data/` — members, then bills, then committees, then votes + finances |
| **Fetch Bills Data** (`fetch-bills.yml`) | Monday and Thursday 11:00 UTC | `data/bills/`, `data/meta/` |
| **Fetch Votes Data** (`fetch-votes.yml`) | Tuesday and Friday 11:00 UTC | `data/votes/`, `data/meta/` |
| **Fetch Amendments Data** (`fetch-amendments.yml`) | Tuesday and Friday 11:30 UTC | `data/amendments/` |
| **Fetch Hearings Data** (`fetch-hearings.yml`) | Daily 10:00 UTC | `data/hearings/` |
| **Deploy to GitHub Pages** (`deploy.yml`) | Push to `main` | `npm test`, `astro build`, Pages deploy |

Hearings run daily rather than twice weekly. A schedule is the most
time-sensitive data on the site, and cadence is the only thing that narrows the
window in which a canceled meeting still renders as scheduled — the dataset is
small enough that the extra runs are cheap.

**Required Actions secret:** `CONGRESS_API_KEY`

### First-time GitHub setup

1. **Settings → Secrets and variables → Actions → `CONGRESS_API_KEY`**
2. **Settings → Pages → Source: GitHub Actions**
3. **Actions → Fetch Congress Data → Run workflow**
4. Deploy runs when that workflow commits to `main`

---

## Financial Conflict Detection

`scripts/fetch-finances.mjs` matches filings to members and committee assignments:

- **Committee overlap** (high) — trades in a sector the member's committee covers
- **Bill timing** (medium) — trades within 30 days of sponsoring related legislation

Ticker-level analysis prefers Stock Watcher dumps when reachable. Otherwise the script merges [CongressWatch](https://congresswatch.vercel.app/data/trades.json), [Kadoa](https://github.com/kadoa-org/congress-trading-monitor) per-filer PTR JSON, and official House Clerk PTR/annual disclosure indexes (Senate eFD when reachable). Records are deduplicated across sources. A fetch that gets no trades at all keeps the file already in `data/`.

> Highlights on member pages are potential conflicts from public disclosures, not findings of wrongdoing.

### Finding members with a trading record

The members directory filters on financial history, with the count of matches shown against
each option so you can see what you are about to narrow to. On the current data:

| Filter | Members |
| --- | --- |
| Everyone | 553 |
| Has financial disclosures | 233 |
| Has stock trades | 143 |
| Traded in a sector their committee oversees | 91 |
| Has a performance chart | 93 |
| No financial records | 320 |

Cards carry a trade count and a committee-overlap badge, so a filtered result explains itself
without opening each profile. "Has a performance chart" is the narrowest useful one: it needs
at least one purchase in a stock whose price history is cached.

### The portfolio chart

Every member page with disclosed purchases carries one chart with four lines. Reading it:

| Line | What it is |
| --- | --- |
| The member | What their disclosed purchases actually did |
| S&P 500 | The same money, on the same days, in an index fund instead (priced from `SPY`, a real fund, so the comparison is to something a person could genuinely have bought) |
| Filing reader | Someone copying each trade on the day its filing became public — typically weeks later |
| Not invested | Money left in cash. A flat line at 0%, and the baseline everything is measured against |

All four receive exactly the same money on the same days, which is what makes the
comparison fair; that also means the "not invested" line doubles as a record of how much
capital was in play. The vertical axis is percent gained per dollar invested, not dollars —
otherwise every line would jump each time more money was added, and you would be watching
how *much* was invested rather than how well it did.

A sale sells the position and parks the proceeds in cash. The index line is deliberately
left alone by it, so the gap that opens up afterwards is exactly what the decision to sell
cost or saved.

What the chart cannot do, all of it stated on the page as well:

- Disclosures report amounts as **ranges**, so every trade is modelled at its midpoint and
  every dollar figure is an estimate. Percentages are the more reliable half.
- Selling a position bought before the reporting period leaves nothing to model. Those
  sales are counted and reported, not dropped.
- A member who only sold in the period gets no chart at all rather than a flat line at zero.
- Charts built on a handful of trades carry a visible warning, because one trade can drive
  the entire line.

### The Congress-wide comparison

The finances page asks the same question of Congress as a whole, with four lines:

| Line | What it is |
| --- | --- |
| Holding cash | Money never invested. A flat line at 0%. |
| Trading (all) | Every disclosed purchase, pooled as one portfolio. Holdings are kept per member, so one person's sale cannot close someone else's shares of the same ticker. |
| S&P 500 | The same money as Trading (all), on the same days, in an index fund instead. |
| Trading (committee) | Only purchases in a sector that member's committee oversees. A smaller pot of money, on different days. |

Because committee trades are not the same dollars, the chart (and the bars above it) compare
**growth per dollar invested**, not dollars. The S&P line is matched to all trades; how
committee trades did against the index on *their* dates is stated in the notes, not drawn
as a fifth line.

The same range-midpoint and unmatched-sale limits apply. Individual trade dots are left
off — there are thousands of them, and they would bury the comparison.

Each member is also drawn as a faint line on the same percent scale. By default the chart
highlights the **top 10 returns that also beat the S&P 500** (or the top 10 overall if
almost nobody beat the market). A statistical **upper outlier** (above the Tukey fence)
keeps an "outlier" badge in the list, but highlighting is a choice — pick any House or
Senate member from the search, or reset to the top performers.

**+** and **−** rescale the vertical axis, same convention as a map: **+** tightens around
the four strategy lines, **−** widens until a clipped outlier (hundreds of percent on a
handful of trades) fits. The default "pack" scale still clips a singleton spike so the
comparison stays readable. Charts built on fewer than five purchases are marked as a
thin record, because one trade can drive the whole line.

### The per-trade timing panels

Where a trade falls in a sector the member's committee oversees, the page also compares
that single trade against the alternatives: making the same move 30 days earlier, 30 days
later, or not making it at all. Outcomes are measured 60 days forward from daily closing
prices.

The site is a static build and Yahoo's chart endpoint sends no CORS headers, so the
browser cannot fetch price history — everything is precomputed by two scripts that
run before the build:

| Script | Output | Notes |
| --- | --- | --- |
| `npm run fetch:prices` | `data/prices/<TICKER>.json` | One request per ticker, not per trade. Committee-overlap tickers by default; `--all` covers every traded ticker, `--force` refetches fresh files. Existing files survive a failed fetch. |
| `npm run enrich:trade-timing` | `data/finances/trade-timing.json` | Reads the price cache, no network. Counterfactuals only — pages slice their own sparkline window from `data/prices/`. |

Both run weekly in `fetch-members.yml` after the finance fetch. `fetch-prices.yml` re-runs
just this part — on a Monday schedule, on demand (Actions → Fetch Stock Prices → Run
workflow), and automatically on any push that touches the price or trade-parsing scripts,
which is how the cache gets rebuilt from environments that cannot reach a market-data host.

A trade whose 60-day window has not elapsed is labeled as still running rather than scored
against a partial window, and a trade with no cached close near its transaction date is
shown with its context but no chart.

---

## Roadmap

- [x] Member directory and profiles
- [x] Bill tracking with stage categorization
- [x] Roll call votes (House + Senate, both sessions)
- [x] Committee directory with referred legislation
- [x] STOCK Act filings and conflict flags
- [x] Data publishing that survives concurrent workflow runs
- [x] Senate votes joined to member pages by bioguide id
- [x] Sponsored-legislation fetch for member profiles
- [x] Party alignment scores and analytics graphs
- [x] CongressWatch finance fallback when Stock Watcher is closed
- [x] Kadoa + House Clerk annual disclosures as additional finance sources
- [x] Build-time price cache and counterfactual timing charts
- [x] Member-level portfolio vs cash and S&P 500 baseline chart
- [x] Congress-wide cash vs trading vs S&P 500 vs committee-overlap chart
- [x] Editorial design system across every page, with light and dark themes
- [x] Amendment tracking, joined to bills, sponsors and roll calls
- [x] Committee hearing and markup schedules

---

## License

Open source. Congressional data comes from public government APIs and official disclosures.
