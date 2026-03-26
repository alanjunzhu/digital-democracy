# Congress Tracker

A free, open-source transparency tool for monitoring the **119th United States Congress**. Browse members, track legislation, view roll call votes, analyze committee assignments, and expose potential conflicts of interest via stock trade disclosures.

**Live site:** [alanjunzhu.github.io/digital-democracy](https://alanjunzhu.github.io/digital-democracy)

---

## Features

- **Member Directory** — All 535+ members with photos, party, state, chamber, and contact info
- **Member Profiles** — Biography, service history, sponsored bills grouped by legislative stage, voting record categorized by policy topic, and a financial transparency section
- **Financial Conflict Detection** — Cross-references member stock trades (via STOCK Act disclosures) with their committee assignments to flag potential conflicts of interest
- **Bill Tracking** — Recent bills filterable by stage (Introduced / In Committee / Passed / Signed into Law) with grouping and summaries
- **Roll Call Votes** — House and Senate votes for both sessions of the 119th Congress, filterable by chamber and topic
- **Committee Directory** — All standing committees in both chambers
- **Analytics Dashboard** — Party breakdown, bill stage distribution, and voting patterns
- **Automated Weekly Updates** — GitHub Actions fetches fresh data from official sources every Sunday
- **Fully Static** — Built with Astro, fast to load, and free to host on GitHub Pages

---

## Data Sources

| Source | Data Provided |
|--------|---------------|
| [Congress.gov API v3](https://api.congress.gov/) | Members, bills, committees |
| [unitedstates.io](https://theunitedstates.io/) | Biographical info, service history, contact details, social media |
| [clerk.house.gov XML](https://clerk.house.gov/legislative/legvotes.aspx) | House roll call votes (no API key required) |
| [senate.gov XML](https://www.senate.gov/legislative/votes_new.htm) | Senate roll call votes (no API key required) |
| [House Stock Watcher](https://housestockwatcher.com/) | House member stock trade disclosures |
| [Senate Stock Watcher](https://senatestockwatcher.com/) | Senate member stock trade disclosures |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [Astro 5](https://astro.build/) (static site generation) |
| Interactive UI | [React 19](https://react.dev/) |
| Styling | [Tailwind CSS 3](https://tailwindcss.com/) |
| Search | [Fuse.js](https://www.fusejs.io/) |
| Hosting | [GitHub Pages](https://pages.github.com/) |
| CI/CD | [GitHub Actions](https://github.com/features/actions) |

---

## Project Structure

```
digital-democracy/
├── src/
│   ├── pages/
│   │   ├── index.astro                  # Home page with stats
│   │   ├── analytics.astro              # Analytics dashboard
│   │   ├── members/
│   │   │   ├── index.astro              # Member directory with filtering
│   │   │   └── [bioguideId].astro       # Member profile (bills, votes, finances)
│   │   ├── bills/
│   │   │   ├── index.astro              # Bill tracker with stage filtering
│   │   │   └── [billId].astro           # Individual bill detail
│   │   ├── votes/
│   │   │   ├── index.astro              # Roll call vote list
│   │   │   └── [voteId].astro           # Vote detail with member positions
│   │   └── committees/
│   │       ├── index.astro              # Committee directory
│   │       └── [systemCode].astro       # Individual committee detail
│   ├── components/
│   │   ├── layout/                      # Layout, Header, Footer
│   │   ├── shared/                      # PartyBadge, ChamberBadge, etc.
│   │   ├── members/                     # MemberCard
│   │   └── interactive/                 # React components
│   │       ├── MemberFilter.tsx         # Member search & filter
│   │       ├── BillFilter.tsx           # Bill filter with stage grouping
│   │       ├── VoteFilter.tsx           # Vote filter by chamber & topic
│   │       ├── CommitteeFilter.tsx      # Committee filter
│   │       └── AnalyticsDashboard.tsx   # Charts & stats
│   ├── lib/
│   │   ├── types.ts                     # TypeScript interfaces
│   │   └── utils.ts                     # Bill stage logic, formatting helpers
│   └── styles/
│       └── global.css                   # Tailwind directives
├── scripts/
│   ├── fetch-members.mjs                # Fetch all members (Congress.gov + unitedstates.io)
│   ├── fetch-bills.mjs                  # Fetch recent bills with sub-resources
│   ├── fetch-committees.mjs             # Fetch committee list
│   ├── fetch-votes.mjs                  # Fetch House + Senate XML votes
│   ├── fetch-finances.mjs               # Fetch stock trades + conflict analysis
│   └── lib/
│       ├── api-client.mjs               # HTTP client with retry, pagination, batch concurrency
│       └── data-writer.mjs              # File I/O utilities
├── data/                                # Generated JSON (committed to repo)
│   ├── members/                         # index.json + {bioguideId}.json
│   ├── bills/                           # index.json + {billId}.json
│   ├── votes/                           # index.json + {voteId}.json + by-member.json
│   ├── committees/                      # index.json + {systemCode}.json
│   ├── finances/                        # by-member.json (trades + conflict flags)
│   └── meta/                            # last-updated.json
├── .github/workflows/
│   ├── deploy.yml                       # GitHub Pages deployment on push to main
│   └── fetch-members.yml                # Weekly data fetch (parallel scripts)
└── public/
    └── favicon.svg
```

---

## Getting Started

### Prerequisites

- [Node.js 22+](https://nodejs.org/)
- A [Congress.gov API key](https://api.congress.gov/sign-up/) (free)

### Local Development

```bash
# Clone the repo
git clone https://github.com/alanjunzhu/digital-democracy.git
cd digital-democracy

# Install dependencies
npm install

# Fetch all data (requires API key; votes and finances need no key)
CONGRESS_API_KEY=your_key_here npm run fetch:members
CONGRESS_API_KEY=your_key_here npm run fetch:bills
CONGRESS_API_KEY=your_key_here npm run fetch:committees
npm run fetch:votes
node scripts/fetch-finances.mjs

# Start the dev server
npm run dev
```

The site will be available at `http://localhost:4321/digital-democracy/`.

### Build for Production

```bash
npm run build
npm run preview
```

---

## CI/CD Workflows

### Data Fetch (`fetch-members.yml`)

Runs **weekly on Sunday at 2:00 AM UTC** (or manually via the Actions tab).

The workflow runs scripts in two parallel phases:

**Phase 1** (parallel): `fetch-members`, `fetch-bills`, `fetch-committees`
**Phase 2** (parallel, after Phase 1): `fetch-votes`, `fetch-finances`

Updated JSON files are committed back to `main`, which triggers the deploy workflow.

**Required secret:** `CONGRESS_API_KEY`
**Optional secret:** `FEC_API_KEY` (for FEC campaign finance data)

### Site Deploy (`deploy.yml`)

Triggers on every push to `main`. Builds the Astro site and deploys to GitHub Pages.

### First-Time Setup

1. Add the API key: **Settings → Secrets → Actions → `CONGRESS_API_KEY`**
2. Enable GitHub Pages: **Settings → Pages → Source: GitHub Actions**
3. Trigger the data fetch: **Actions → "Fetch Congress Data" → Run workflow**
4. The deploy runs automatically once data is committed

---

## Financial Conflict Detection

The `fetch-finances.mjs` script implements a conflict-of-interest analysis by cross-referencing member stock trades (from STOCK Act disclosures) with their committee assignments:

- **Committee overlap** (high severity) — trades in sectors directly regulated by a member's committee (e.g., defense stocks while on the Armed Services Committee)
- **Bill timing** (medium severity) — trades within 30 days of sponsoring related legislation

Sector mapping covers 100+ tickers and keyword-based asset description matching across Defense, Technology, Finance, Energy, Healthcare, Transportation, and Agriculture.

> **Note:** All data is sourced from public disclosures. Red highlights on member profiles indicate potential conflicts, not confirmed wrongdoing.

---

## Roadmap

- [x] Member directory with search and filtering
- [x] Individual member profile pages
- [x] Bill tracking with stage categorization
- [x] Roll call votes (House + Senate, both sessions)
- [x] Voting record grouped by policy topic on member pages
- [x] Committee directory
- [x] Stock trade disclosures with conflict-of-interest detection
- [x] Parallel data fetching (~3-5 min vs ~30 min previously)
- [ ] Voting alignment scores (member vs party, member vs member)
- [ ] Amendment tracking
- [ ] Hearing schedules

---

## License

This project is open source. All Congressional data is sourced from public government APIs and official disclosures.
