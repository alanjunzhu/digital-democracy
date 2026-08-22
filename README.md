# Congress Tracker

A free, open-source transparency tool for the **119th United States Congress**. Browse members, track recently active legislation, view roll call votes, inspect committee referrals, and see STOCK Act filings next to committee assignments.

**Live site:** [alanjunzhu.github.io/digital-democracy](https://alanjunzhu.github.io/digital-democracy)

The site is static. Node scripts fetch public data into `data/`, that JSON is committed, and Astro builds pages from it for GitHub Pages.

---

## Features

- **Members** — Directory of current members with photos, party, state, and chamber; profiles with contact info, service history, sponsored bills by stage, votes by topic, committee assignments, and financial filings
- **Bills** — The most recently *updated* measures (not the oldest introductions), filterable by stage, with committee referrals that distinguish House from Senate committees of the same name
- **Votes** — House and Senate roll calls for both sessions of the 119th Congress, filterable by chamber and topic
- **Committees** — Standing committees and subcommittees, each listing legislation referred to it in this congress
- **Finances** — STOCK Act periodic transaction reports (and ticker-level trades when the Stock Watcher dumps are reachable), with committee-overlap and bill-timing flags
- **Analytics** — Party breakdown, bill stages, and voting patterns
- **Automated refresh** — GitHub Actions fetch and commit data on a schedule; a push to `main` rebuilds the site

---

## Data Sources

| Source | Used for |
|--------|----------|
| [Congress.gov API v3](https://api.congress.gov/) | Members, bills (sorted `updateDate+desc`), committees, committee legislation |
| [unitedstates/congress-legislators](https://unitedstates.github.io/congress-legislators/) | Names, websites, social links, committee memberships (`github.io` first; `theunitedstates.io` as fallback) |
| [clerk.house.gov](https://clerk.house.gov/legislative/legvotes.aspx) | House roll call XML |
| [senate.gov](https://www.senate.gov/legislative/votes_new.htm) | Senate roll call XML |
| [House Clerk disclosures](https://disclosures-clerk.house.gov/) | STOCK Act periodic transaction reports when House Stock Watcher S3 is closed |
| [House Stock Watcher](https://housestockwatcher.com/) | House trades with tickers (when the S3 dump is reachable) |
| [Senate Stock Watcher](https://senatestockwatcher.com/) | Senate trades with tickers (when the S3 dump is reachable) |

Votes, finances, and the unitedstates files need no Congress.gov key. Members, bills, and committees do.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Pages | [Astro 5](https://astro.build/) (static) |
| Filters / search | [React 19](https://react.dev/) + [Fuse.js](https://www.fusejs.io/) |
| Styles | [Tailwind CSS 3](https://tailwindcss.com/) |
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
│   │   │   └── [voteId].astro           # Member positions
│   │   └── committees/
│   │       ├── index.astro              # Directory
│   │       └── [committeeId].astro      # Referrals + subcommittees
│   ├── components/
│   │   ├── layout/                      # Layout, Header, Footer
│   │   ├── shared/                      # PartyBadge, ChamberBadge
│   │   ├── members/                     # MemberCard
│   │   └── interactive/                 # React filters and analytics
│   │       ├── MemberFilter.tsx
│   │       ├── BillFilter.tsx
│   │       ├── VoteFilter.tsx
│   │       ├── CommitteeFilter.tsx
│   │       └── AnalyticsDashboard.tsx
│   ├── lib/
│   │   ├── types.ts                     # Shared TypeScript types
│   │   ├── utils.ts                     # Bill stages, state names, formatting
│   │   ├── committees.ts                # Resolve referrals by systemCode
│   │   └── committee-bills.ts           # Group stored bills onto committee pages
│   └── styles/
│       └── global.css
├── scripts/
│   ├── fetch-members.mjs                # Congress.gov members + legislator bios
│   ├── fetch-bills.mjs                  # Recently updated bills + sub-resources
│   ├── fetch-committees.mjs             # Committees + referred legislation
│   ├── fetch-votes.mjs                  # House + Senate XML (both sessions)
│   ├── fetch-finances.mjs               # Trades / PTR filings + conflict flags
│   ├── fix-data-urls.mjs                # Rebuild stored congress.gov URLs (no API)
│   ├── backfill-member-bio.mjs          # Refill names/websites/socials (no API key)
│   ├── commit-data.sh                   # Publish regenerated data without rebase races
│   └── lib/
│       ├── api-client.mjs               # Retry, pagination, batch fetch, User-Agent
│       ├── data-writer.mjs              # Read/write under data/ (or CONGRESS_DATA_DIR)
│       └── unitedstates.mjs             # Legislator hosts + committee-membership map
├── shared/
│   └── congress-urls.mjs                # Bill and committee URL builders (scripts + pages)
├── tests/                               # node --test
│   ├── api-client.test.mjs
│   ├── commit-data.test.mjs
│   ├── congress-urls.test.mjs
│   ├── fetch-normalize.test.mjs
│   ├── fetch-pipeline.test.mjs
│   ├── finances.test.mjs
│   ├── members.test.mjs
│   ├── unitedstates.test.mjs
│   └── votes.test.mjs
├── data/                                # Generated JSON, committed
│   ├── members/                         # index.json + {bioguideId}.json
│   ├── bills/                           # index.json + {billId}.json
│   ├── votes/                           # index.json + {voteId}.json + by-member.json
│   ├── committees/                      # index.json + {systemCode}.json
│   ├── finances/                        # by-member.json
│   └── meta/                            # last-updated.json
├── .github/workflows/
│   ├── deploy.yml                       # Test, build, deploy Pages on push to main
│   ├── fetch-members.yml                # Weekly full fetch (members, bills, committees, votes, finances)
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
node scripts/fetch-finances.mjs
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

Covers URL builders, fetch normalization, an end-to-end fetch against a stand-in API, member name preservation, committee-membership mapping, Clerk PTR parsing, vote probing, HTTP client behavior, and `commit-data.sh` races.

### Production Build

```bash
npm run build
npm run preview
```

---

## CI/CD

All three data workflows check out `main`, write JSON, and publish with `scripts/commit-data.sh`. They share the `fetch-data` concurrency group (`cancel-in-progress: false`) so they queue instead of overlapping. If `main` still moves during a run, the script resets to the latest `main` and reapplies only the paths that job owns, instead of rebasing and failing on aggregate files like `data/bills/index.json`.

| Workflow | Schedule | What it writes |
|----------|----------|----------------|
| **Fetch Congress Data** (`fetch-members.yml`) | Sunday 02:00 UTC | All of `data/` — phase 1 members/bills/committees in parallel, then votes + finances |
| **Fetch Bills Data** (`fetch-bills.yml`) | Monday and Thursday 11:00 UTC | `data/bills/`, `data/meta/` |
| **Fetch Votes Data** (`fetch-votes.yml`) | Tuesday and Friday 11:00 UTC | `data/votes/`, `data/meta/` |
| **Deploy to GitHub Pages** (`deploy.yml`) | Push to `main` | `npm test`, `astro build`, Pages deploy |

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

Ticker-level analysis needs the Stock Watcher dumps. When those S3 buckets return 403, the script stores House Clerk PTR filings (PDF links, no tickers) and still attaches committee memberships so profiles are not blank. A fetch that gets no trades at all keeps the file already in `data/`.

> Highlights on member pages are potential conflicts from public disclosures, not findings of wrongdoing.

---

## Roadmap

- [x] Member directory and profiles
- [x] Bill tracking with stage categorization
- [x] Roll call votes (House + Senate, both sessions)
- [x] Committee directory with referred legislation
- [x] STOCK Act filings and conflict flags
- [x] Data publishing that survives concurrent workflow runs
- [ ] Voting alignment scores
- [ ] Amendment tracking
- [ ] Hearing schedules

---

## License

Open source. Congressional data comes from public government APIs and official disclosures.
