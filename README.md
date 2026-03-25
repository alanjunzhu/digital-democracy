# Congress Tracker

A free, open-source transparency tool for monitoring the **119th United States Congress**. Browse, search, and filter every Senator and Representative with data aggregated from official public sources.

**Live site:** [alanjunzhu.github.io/digital-democracy](https://alanjunzhu.github.io/digital-democracy)

---

## Features

- **Member Directory** — Browse all 535+ members of Congress with photos, party affiliation, and contact info
- **Search & Filter** — Real-time filtering by name, state, chamber (Senate/House), and party
- **Member Profiles** — Detailed pages with biography, service history, office address, and social media links
- **Automated Data Updates** — Weekly GitHub Actions workflow fetches the latest data from official sources
- **Fully Static** — Fast, accessible, and free to host on GitHub Pages

## Data Sources

Member data is aggregated from three public sources:

| Source | Data Provided |
|--------|--------------|
| [Congress.gov API](https://api.congress.gov/) | Official member list, party, state, chamber, congressional detail |
| [unitedstates.io](https://theunitedstates.io/) | Biographical info, service history, contact details |
| [unitedstates.io (social)](https://theunitedstates.io/) | Twitter, Facebook, YouTube handles |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Astro 5](https://astro.build/) (static site generation) |
| Interactive UI | [React 19](https://react.dev/) |
| Styling | [Tailwind CSS 3](https://tailwindcss.com/) |
| Search | [Fuse.js](https://www.fusejs.io/) |
| Hosting | [GitHub Pages](https://pages.github.com/) |
| CI/CD | [GitHub Actions](https://github.com/features/actions) |

## Project Structure

```
digital-democracy/
├── src/
│   ├── pages/
│   │   ├── index.astro              # Home page with stats & featured members
│   │   ├── members/
│   │   │   ├── index.astro          # Member directory with filtering
│   │   │   └── [bioguideId].astro   # Individual member detail pages
│   │   ├── bills/index.astro        # Bills tracking (coming soon)
│   │   ├── votes/index.astro        # Vote tracking (coming soon)
│   │   └── committees/index.astro   # Committees (coming soon)
│   ├── components/
│   │   ├── layout/                  # Layout, Header, Footer
│   │   ├── shared/                  # PartyBadge, ChamberBadge
│   │   ├── interactive/             # MemberFilter (React)
│   │   └── members/                 # MemberCard
│   ├── lib/
│   │   ├── types.ts                 # TypeScript interfaces
│   │   └── utils.ts                 # Helpers (state names, formatting)
│   └── styles/
│       └── global.css               # Tailwind directives
├── scripts/
│   ├── fetch-members.mjs            # Data fetching orchestrator
│   └── lib/
│       ├── api-client.mjs           # HTTP client with retry & pagination
│       └── data-writer.mjs          # File I/O utilities
├── data/
│   ├── members/                     # Generated member JSON files
│   └── meta/                        # Fetch metadata & timestamps
├── .github/workflows/
│   ├── deploy.yml                   # GitHub Pages deployment
│   └── fetch-members.yml            # Weekly data fetch
└── public/
    └── favicon.svg
```

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

# Fetch member data (requires API key)
CONGRESS_API_KEY=your_key_here npm run fetch:members

# Start the dev server
npm run dev
```

The site will be available at `http://localhost:4321/digital-democracy/`.

### Build for Production

```bash
npm run build
npm run preview
```

## Deployment

The site deploys automatically via two GitHub Actions workflows:

### 1. Data Fetch (`fetch-members.yml`)

- **Schedule:** Runs weekly on Sunday at 2:00 AM UTC
- **Manual trigger:** Actions tab > "Fetch Members Data" > "Run workflow"
- Fetches data from all three sources, merges them, and commits updated JSON files to the repo
- Requires the `CONGRESS_API_KEY` repository secret

### 2. Site Deploy (`deploy.yml`)

- **Trigger:** Every push to `main` (including data commits from the fetch workflow)
- Builds the Astro site and deploys to GitHub Pages

### Setup Steps

1. **Add the API key:** Settings > Secrets and variables > Actions > Repository secrets > Add `CONGRESS_API_KEY`
2. **Enable GitHub Pages:** Settings > Pages > Source: "GitHub Actions"
3. **Run the data fetch:** Actions tab > "Fetch Members Data" > "Run workflow"
4. The deploy workflow runs automatically after the data is committed

## Roadmap

- [x] Member directory with search and filtering
- [x] Individual member profile pages
- [x] Automated weekly data updates
- [ ] Bill tracking and search
- [ ] Roll call vote records
- [ ] Committee membership details
- [ ] Voting alignment scores

## License

This project is open source. Congressional data is sourced from public government APIs.
