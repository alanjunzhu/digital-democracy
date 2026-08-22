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
| Styling     | Tailwind CSS 3                                |
| Data        | Congress.gov API v3                           |
| Hosting     | GitHub Pages                                  |
| CI/CD       | GitHub Actions (weekly fetch + auto-deploy)   |

### API Call Budget

The Congress.gov API allows **5,000 requests/hour**. Our weekly fetch is designed to stay well within this:

| Data Type   | API Calls per Fetch | Strategy                           |
|-------------|--------------------|------------------------------------|
| Members     | ~550               | 1 paginated list + 548 detail      |
| Bills       | ~2,500             | 2 paginated pages + 500 × 5 sub-resources |
| Committees  | ~700               | 1 call per chamber + detail and bills per committee |
| Votes       | ~110               | 1 list page + ~100 vote details    |
| **Total**   | **~3,860**         | Under the 5,000/hr limit           |

Bill lists are requested with `sort=updateDate+desc`. Without it the endpoint
returns a congress's oldest measures first, so a capped fetch only ever sees
bills introduced the week the congress convened.

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

## Data Flow

```
Weekly Cron (Sunday 2am UTC)
  │
  ├── fetch-members.mjs ──→ data/members/*.json     (~550 API calls)
  ├── fetch-bills.mjs ────→ data/bills/*.json        (~1,000 API calls)
  ├── fetch-committees.mjs → data/committees/*.json   (~3 API calls)
  └── fetch-votes.mjs ────→ data/votes/*.json         (~110 API calls)
  │
  ├── git commit + push
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
├── src/
│   ├── pages/                  # Astro routes (SSG)
│   ├── components/
│   │   ├── layout/             # Layout, Header, Footer
│   │   ├── shared/             # PartyBadge, ChamberBadge
│   │   └── interactive/        # React filter components
│   ├── lib/
│   │   ├── types.ts            # TypeScript interfaces
│   │   └── utils.ts            # Shared utilities
│   └── styles/
│       └── global.css          # Tailwind directives
├── PLAN.md                     # This file
├── README.md                   # User-facing documentation
├── astro.config.mjs
├── tailwind.config.mjs
└── package.json
```
