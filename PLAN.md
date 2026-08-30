# Congress Tracker — Development Plan

## Overview

Congress Tracker is a free, open-source civic transparency tool for monitoring the 119th United States Congress. It aggregates data from official public sources and presents it in an accessible, searchable interface hosted on GitHub Pages.

**Live site:** [alanjunzhu.github.io/digital-democracy](https://alanjunzhu.github.io/digital-democracy)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Data Sources                       │
│  Congress.gov API v3 · unitedstates.io · Clerk.gov  │
└──────────────────────┬──────────────────────────────┘
                       │  GitHub Actions (weekly cron)
                       ▼
┌─────────────────────────────────────────────────────┐
│               Data Layer (data/*.json)               │
│  members/  ·  bills/  ·  committees/  ·  votes/     │
└──────────────────────┬──────────────────────────────┘
                       │  Astro static build
                       ▼
┌─────────────────────────────────────────────────────┐
│              Static Site (dist/)                     │
│  Astro SSG + React interactive components           │
│  Tailwind CSS · GitHub Pages deployment             │
└─────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer       | Technology                                    |
|-------------|-----------------------------------------------|
| Framework   | Astro 5 (static site generation)              |
| Interactive | React 19 (filters, search)                    |
| Styling     | Tailwind CSS 3 over CSS-variable design tokens |
| Type        | Newsreader · Public Sans · IBM Plex Mono      |
| Data        | Congress.gov API v3                           |
| Hosting     | GitHub Pages                                  |
| CI/CD       | GitHub Actions (weekly fetch + auto-deploy)   |

### API Call Budget

The Congress.gov API allows **5,000 requests/hour**. Our weekly fetch is designed to stay well within this:

| Data Type   | API Calls per Fetch | Strategy                           |
|-------------|--------------------|------------------------------------|
| Members     | ~1,100             | 1 list + 548 detail + 548 sponsored-legislation |
| Bills       | ~2,500             | 2 paginated pages + 500 × 5 sub-resources |
| Committees  | ~700               | 1 call per chamber + detail and bills per committee |
| Votes       | 0 (Congress.gov)   | Clerk + Senate XML probes, no API key |
| **Total**   | **~4,300**         | Under the 5,000/hr limit; sequential steps on Sunday |

Bill lists are requested with `sort=updateDate+desc`. Without it the endpoint
returns a congress's oldest measures first, so a capped fetch only ever sees
bills introduced the week the congress convened.

Member detail fetches also pull `/member/{id}/sponsored-legislation` (limit 50)
so profiles are not limited to the 500 recently updated bills. That adds ~550
calls; the Sunday job runs members, bills, and committees **sequentially** on
one API key so they do not burst the same host.

Votes do **not** use Congress.gov. House Clerk XML and Senate LIS XML are
probed; finances use Stock Watcher S3 with House Clerk PTR XML as fallback.

---

## Member pages: votes, sponsored bills, finances

These three joins were designed in Phase 5 but were incomplete in the stored
data. This is the plan that closes them.

### Voting record on the member page

**Problem.** House pages worked. Senate pages showed "no voting record" even
though `data/votes/` had hundreds of Senate roll calls. Senate XML stores LIS
ids (`S428`). The matcher skipped any id longer than 3 characters and keyed on
full state names (`alabama`) while the XML uses abbreviations (`AL`), so
**zero** senators were written into `votes/by-member.json`. Vote detail pages
linked to `/members/S428/`, which 404s. A House-only fallback also painted
unrelated votes onto a member who was merely missing a by-member entry.

**Plan.**

1. Treat a bioguide id as `/^[A-Z]\d{6}$/`. Map LIS ids by last name + state
   abbreviation (and the last two name tokens for "Van Hollen").
2. Repair committed JSON with `scripts/repair-vote-records.mjs` (no API key)
   and keep the same mapper in `fetch-votes.mjs` for the next scheduled run.
3. Rebuild `votes/by-member.json` from the repaired files, skipping leftover
   LIS ids.
4. On the member page, read only that member's positions. Do not fall back to
   the global vote list.
5. Parse citations with `parseLegislativeCitation` so "S. Res. 817" is
   `sres817`, not `s817`, and bill pages can join roll calls.

### Sponsored legislation on the member page (and the bill/sponsor join)

**Problem.** Member pages filtered `data/bills/index.json` (500 recently
*updated* measures). About half the chamber never appeared as a sponsor.
`sponsoredBills` on each member file was always `[]`. Bill pages linked the
sponsor but did not show how that sponsor voted on the bill's roll calls.

**Plan.**

1. `fetch-members.mjs` requests `/member/{bioguideId}/sponsored-legislation`
   (this congress, 50 most recent) and stores summaries on the member file.
2. The member page prefers that list, overlaying richer fields from the 500
   bill index when a `billId` is also a local page. Measures not in `data/bills/`
   link out to congress.gov rather than a 404.
3. The bill page, for each joined roll call, reads the vote file and shows
   **Sponsor: Yea/Nay**.

Until the next Sunday members fetch, profiles still use the 500-bill index.

### Financial data on the member page

**Problem.** House/Senate Stock Watcher S3 currently returns nothing useful
(403). The fetch already falls back to House Clerk PTR XML, so 138 members have
PDF filings with empty tickers. The profile UI treated those as stock trades
(0 purchases, 0 unique stocks) and hid the section when `trades` was empty.
Senate has no PTR bulk dump. `FEC_API_KEY` was passed in YAML but never read.

**Plan.**

1. Split PTR filings from ticker trades (`partitionFinanceTrades`). Show Clerk
   PDF links on the member page even when there are no tickers.
2. Keep conflict flags for ticker-level trades only (they need a sector).
3. Drop `FEC_API_KEY` from the Sunday workflow. Do not invent an FEC client.
4. When Stock Watcher S3 is reachable again, ticker trades light up without a
   UI change. While it is closed, `fetch-finances.mjs` uses CongressWatch's
   public `trades.json` (Clerk + Senate PTRs with tickers and bioguide ids).
   Senate efdsearch is a form POST, not a bulk file — leave a direct client
   until there is a stable dump.

### Trade timing charts on the member page

**Problem.** The counterfactual chart existed but almost never drew. Five things
stacked up:

1. `data/finances/trade-timing.json` held 24 precomputed entries covering 7
   members, because `enrich-trade-timing.mjs` took the global top 25 trades by
   `priorityScore` while the member page took the *first 8* overlap trades in
   raw source order. Across those 7 members only 4 had a single key in common,
   so 537 of 541 profiles had nothing precomputed.
2. With nothing precomputed the component fell back to fetching
   `query1.finance.yahoo.com` from the browser. The site is a static build and
   that endpoint sends no CORS headers, so the fetch fails for every visitor and
   the panel renders "Chart unavailable" instead of a chart.
3. `enrich-trade-timing.mjs` was never wired into any workflow, so the file was
   a one-off snapshot that went stale as new trades arrived.
4. Even when data existed the explorer opened collapsed — a chart behind a click
   reads as no chart.
5. One Yahoo request per trade does not scale: 1,927 committee-overlap trades
   span only 225 distinct tickers.

**Plan.**

1. `scripts/fetch-stock-prices.mjs` caches daily closes once per *ticker* into
   `data/prices/<TICKER>.json`, dates and closes as parallel arrays. Overlap
   tickers by default, `--all` for all 1,690, plus SPY for the coming benchmark.
   A failed symbol keeps whatever is already cached.
2. `enrich-trade-timing.mjs` reads that cache instead of the network and covers
   every overlap trade — the same predicate the member page renders, so keys
   cannot drift again. It stores counterfactuals only; pages slice their own
   sparkline window from `data/prices/` via `shared/timing-precompute.mjs`.
3. Drop the browser fetch. Everything the panel draws is precomputed.
4. Sort member-page candidates newest first and open the first chartable one.
5. Run both scripts in `fetch-members.yml` after the finance fetch.

**Correctness fixes found on the way.** `forwardReturn` used
`priceOnOrBefore(endDate)`, which silently returns the last close when the
series stops short — a trade three weeks old reported a full 60-day return, and
a 2026 trade against a series ending in 2025 was priced off a year-old close.
Now a start date more than `MAX_PRICE_STALENESS_DAYS` past its nearest close is
refused outright, and a horizon the series never reaches returns null with
`horizonComplete: false` so the UI can say the window is still running.

### Member portfolio vs the market

**Goal.** One chart per member answering "if you had mirrored their disclosed
purchases, how would you have done?" — against the S&P 500 and against not
investing.

**Model.** Every purchase contributes the midpoint of its amount range to all
lines on the same day; identical cash flows are what make the comparison fair, so
the cash line doubles as the capital-deployed line. A sale closes up to the
quantity held from earlier in-window purchases and moves the proceeds to that
portfolio's own cash sleeve — the benchmark is untouched by it, and that
divergence is the value or cost of the decision to sell. A fourth line repeats the
purchases on each trade's disclosure date, so the gap to the member line is the
part of the return the filings never made available. The chart plots growth per
dollar invested; raw dollars squeeze every line into the top of the plot, because
contributions arrive in a lump early.

**Traps found while building it.** The follower line needs its *own*
contributed-to-date as its denominator — measured against the member's it reads as
a 22% loss for the crime of not having bought yet. Valuing holdings by scanning
each price series per day is quadratic and a member with 1,500 trades across 80
tickers dominates the build, so each series is walked once against the shared
calendar. Members who only sold in the window contribute nothing and produced an
all-zero chart; that is now refused rather than drawn. And the y-axis tick range
has to round *up* to cover the maximum, or the best-performing series clips out of
frame.

**Honest limits, all on the page.** Disclosures give ranges, not positions, so
81% of trades sit in the widest-relative bracket and every value is an estimate.
Sales of positions acquired before the window cannot be represented and are
counted. Trades with no cached price are excluded and counted.

### Party alignment scores

**Goal.** Show how often each member votes with their party majority, and how
often roll calls split on party lines.

**Plan.**

1. `shared/party-alignment.mjs` scores a member against each vote's
   `partyBreakdown` (Independents vs Democratic majority).
2. Analytics page shows party-line rate, average alignment by party, and
   House/Senate loyalist and least-aligned lists.
3. Member pages show a party-alignment percentage next to the voting record.

**The stored House breakdown cannot be used directly.** `partyBreakdown` in
`data/votes/index.json` files every House member under `democratic` and leaves
`republican` at zero, so no House roll call can ever register a D-vs-R split.
Read straight, that produced a party-line rate of `0% (0/501)` for the House and
dropped most House members out of the alignment ranking. Both the member page and
the analytics page recount from the individual casts via
`loadRecountedBreakdowns()` in `shared/policy-data.mjs` — anything scoring party
alignment has to do the same.

---

## Phases

### Phase 1: Member Directory ✅ Complete

**Goal:** Browse and search all current members of Congress.

**Features:**
- Member list with photos, party badges, and chamber badges
- Interactive filtering by name, state, chamber, and party
- Individual member profile pages with:
  - Contact info (website, phone, office address)
  - Social media links (Twitter, Facebook, YouTube)
  - Service history timeline
- Automated weekly data refresh via GitHub Actions

**Data Sources:**
- Congress.gov API `/member/congress/119` (primary)
- unitedstates.io legislators-current.json (biographical)
- unitedstates.io legislators-social-media.json (social)

**Files:**
- `scripts/fetch-members.mjs` — Data fetching script
- `src/pages/members/index.astro` — Member list page
- `src/pages/members/[bioguideId].astro` — Member detail page
- `src/components/interactive/MemberFilter.tsx` — React filter component

---

### Phase 2: Bill Tracking ✅ Complete

**Goal:** Browse and search recent legislation with status tracking.

**Features:**
- Bill list with interactive filtering by chamber, policy area, and search
- Individual bill detail pages with:
  - Sponsor info (linked to member profile)
  - Bill summary text
  - Committee referrals
  - Legislative subjects/tags
  - Full action history timeline
  - Links to Congress.gov and full text

**Data Sources:**
- Congress.gov API `/bill/119` (list)
- Congress.gov API `/bill/119/{type}/{number}` (detail)
- Congress.gov API `/bill/119/{type}/{number}/actions` (actions)

**Files:**
- `scripts/fetch-bills.mjs` — Data fetching script
- `src/pages/bills/index.astro` — Bill list page
- `src/pages/bills/[billId].astro` — Bill detail page
- `src/components/interactive/BillFilter.tsx` — React filter component

---

### Phase 3: Committee Directory ✅ Complete

**Goal:** Browse all congressional committees with membership and jurisdiction info.

**Features:**
- Committee list organized by chamber (House, Senate, Joint)
- Committee detail pages with:
  - Committee type and jurisdiction
  - Subcommittee listing, linked to the parent committee
  - Legislation referred to the committee, linked to bill pages
  - Links to the congress.gov profile and the committee's own website
- Filter by chamber

**Data Sources:**
- Congress.gov API `/committee/119/{chamber}` (3 calls: House, Senate, Joint)
- Congress.gov API `/committee/{chamber}/{code}` (official website)
- Congress.gov API `/committee/{chamber}/{code}/bills` (referred legislation,
  narrowed by `fromDateTime` and filtered to the current congress)

**Files:**
- `scripts/fetch-committees.mjs` — Data fetching script
- `src/pages/committees/index.astro` — Committee list page
- `src/pages/committees/[committeeId].astro` — Committee detail page
- `src/components/interactive/CommitteeFilter.tsx` — React filter component

---

### Phase 4: Vote Records ✅ Complete

**Goal:** Track House roll call votes with party breakdowns.

**Features:**
- Recent House vote list with results and party tallies
- Vote detail pages with:
  - Vote question and result (Passed/Failed)
  - Party breakdown (D/R/I yea/nay counts)
  - Bill reference (linked to bill page)
  - Visual vote tally bars
- Filter by result and search

**Data Sources:**
- Congress.gov API `/house-vote/119/1` (House votes only — Senate votes not yet available in API v3)
- Limited to ~100 most recent votes per fetch

**Limitations:**
- Senate votes are **not available** in the Congress.gov API v3 as of 2026
- Only legislation-related House votes from 118th Congress onward

**Files:**
- `scripts/fetch-votes.mjs` — Data fetching script
- `src/pages/votes/index.astro` — Vote list page
- `src/pages/votes/[voteId].astro` — Vote detail page
- `src/components/interactive/VoteFilter.tsx` — React filter component

---

### Phase 5: Cross-Linking & Enhancements ✅ Complete

**Goal:** Connect data across entities for richer exploration.

**Features:**
- Member pages show sponsored bills (linked from bill data)
- Member pages show recent House votes (for House members)
- Bill detail pages link to sponsor's member profile
- Vote detail pages link to related bill pages
- Navigation updated with all sections

**Files:**
- `src/pages/members/[bioguideId].astro` — Updated with cross-linked bills and votes
- `src/components/layout/Header.astro` — Updated navigation

---

### Phase 6: Analytics & Visualization ✅ Complete

**Goal:** Data visualizations for civic insight.

**Features:**
- Analytics dashboard page with overview cards (members, bills, votes, committees)
- Party composition visualization (D/R/I bar chart)
- Vote outcomes breakdown (pass/fail rate, average tally)
- Bills by policy area (horizontal bar chart)
- Largest state delegations (horizontal bar chart)
- Committee chamber breakdown
- Bills by origin chamber

**Files:**
- `src/pages/analytics.astro` — Analytics page with data aggregation
- `src/components/interactive/AnalyticsDashboard.tsx` — React visualization component

---

### Phase 7: Design system ✅ Complete

**Goal:** Set the site like a public record rather than a dashboard, and make every
page speak one vocabulary.

**The design language.** Newsroom typography on a warm paper ground; hairline rules
instead of cards; monospace reserved for anything a reader might want to verify
(identifiers, dates, tallies, counts). Radius is 2px or 0, nothing is pill-shaped
except a 6px status dot, and there are no box-shadows anywhere — depth comes from the
paper/card value difference and from rules. Full reference in the README.

**Rules worth keeping in mind when adding to the site:**

- **Colour marks the series, not the value.** Gains never turn green, losses never
  turn red. Red is the interface accent and navy is Yea; neither ever carries party
  meaning. Party hues (D/R/I) are data and are unchanged from the original site.
- **Chart axis and series labels are HTML in a gutter, never SVG `<text>`.** The plots
  use `preserveAspectRatio="none"`, which stretches any text inside the viewBox.
  Keeping labels in HTML also leaves them selectable and themable.
- **State the limit in the same view.** Estimates, midpoints and flags carry a caveat
  note beside them — red left rule for a limit on what the data can support, grey for
  coverage or freshness — not a link to a methodology page.
- **`.tile-grid` children own their own padding.** The shared rule sets only the
  background; Tailwind emits variant utilities after plain ones, so a default padding
  there cannot be overridden per-tile by class order.

**Files:**
- `src/styles/global.css` — tokens (light + dark) and the shared helpers
- `tailwind.config.mjs` — tokens surfaced so `bg-paper` / `border-rule` work in classes
- `src/components/layout/` — Layout (theme before first paint), Header, Footer, PageIndex
- `shared/vote-outcome.mjs` — reads a roll-call result string as agreed/rejected

---

## Data Flow

```
Weekly Cron (Sunday 2am UTC)
  │
  ├── fetch-members.mjs ──→ data/members/*.json     (detail + sponsored legislation)
  ├── fetch-bills.mjs ────→ data/bills/*.json        (sequential after members)
  ├── fetch-committees.mjs → data/committees/*.json
  ├── fetch-votes.mjs ────→ data/votes/*.json         (Clerk + Senate XML)
  └── fetch-finances.mjs ─→ data/finances/by-member.json
  │
  ├── git commit + push (commit-data.sh, fetch-data concurrency group)
  │
  └── Triggers deploy.yml ──→ Astro build ──→ GitHub Pages
```

## Local Development

```bash
# Install dependencies
npm install

# Fetch all data (requires CONGRESS_API_KEY env var)
npm run fetch:members
npm run fetch:bills
npm run fetch:committees
npm run fetch:votes

# Start dev server
npm run dev

# Build for production
npm run build
```

## Repository Structure

```
digital-democracy/
├── .github/workflows/
│   ├── deploy.yml              # GitHub Pages deployment
│   └── fetch-members.yml       # Weekly data fetch (all types)
├── scripts/
│   ├── fetch-members.mjs       # Member data pipeline
│   ├── fetch-bills.mjs         # Bill data pipeline
│   ├── fetch-committees.mjs    # Committee data pipeline
│   ├── fetch-votes.mjs         # Vote data pipeline
│   └── lib/
│       ├── api-client.mjs      # Shared HTTP client with retry/pagination
│       └── data-writer.mjs     # JSON file I/O utilities
├── data/                       # Generated data (committed to repo)
│   ├── members/
│   ├── bills/
│   ├── committees/
│   ├── votes/
│   └── meta/
├── shared/                     # Logic used by both scripts and pages (.mjs)
│   ├── vote-outcome.mjs        # Reads a roll-call result as agreed/rejected
│   ├── party-alignment.mjs     # Party-line and member alignment scoring
│   ├── portfolio-series.mjs    # Member and Congress portfolios vs S&P 500
│   └── page-index.mjs          # Section lists for the on-page index rail
├── src/
│   ├── pages/                  # Astro routes (SSG)
│   ├── components/
│   │   ├── layout/             # Layout, Header, Footer, PageIndex
│   │   ├── shared/             # PartyBadge, ChamberBadge, record rows
│   │   ├── members/            # MemberCard
│   │   └── interactive/        # React filters and charts
│   ├── lib/
│   │   ├── types.ts            # TypeScript interfaces
│   │   └── utils.ts            # Bill stages, vote outcomes, formatting
│   └── styles/
│       └── global.css          # Design tokens (light + dark) and helpers
├── PLAN.md                     # This file
├── README.md                   # User-facing documentation
├── astro.config.mjs
├── tailwind.config.mjs
└── package.json
```
