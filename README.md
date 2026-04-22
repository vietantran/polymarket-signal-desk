# Polymarket Signal Desk

Live dashboard for Polymarket markets related to:

- US-Iran war and escalation
- Strait of Hormuz disruption risk
- Trump actions
- US Federal Reserve interest-rate decisions

It combines:

- Gamma API market and event discovery
- CLOB orderbook and pricing data
- market-channel WebSocket updates
- Data API trades, holders, positions, activity, and wallet anomaly scoring

## Local development

Requirements:

- Node.js 24+
- npm 11+

Run:

```bash
npm install
npm run dev
```

The Vite dev server proxies:

- `/api/gamma` -> `https://gamma-api.polymarket.com`
- `/api/data` -> `https://data-api.polymarket.com`
- `/api/clob` -> `https://clob.polymarket.com`

## Production deployment

Do not use GitHub Pages for the live app.

Reason:

- the dashboard needs same-origin proxying for the Polymarket REST APIs
- GitHub Pages is static only, so it cannot proxy `/api/*`
- the current Pages deployment is useful as a static preview shell, not as the live production target

### Recommended: Vercel

This repo is configured for Vercel via [vercel.json](./vercel.json), using external rewrites for the Polymarket REST APIs.

Relevant Vercel docs:

- [Deploying Git repositories](https://vercel.com/docs/deployments/git)
- [External rewrites](https://vercel.com/docs/rewrites/)

Deploy steps:

1. Push this repo to GitHub.
2. In Vercel, click `New Project`.
3. Import the GitHub repository.
4. Accept the detected Vite settings.
5. Deploy.

No required environment variables for the default setup.

Production behavior:

- frontend calls `/api/gamma`, `/api/data`, `/api/clob`
- Vercel rewrites those requests to Polymarket
- browser WebSocket connects directly to `wss://ws-subscriptions-clob.polymarket.com/ws/market`

### Optional environment variables

Only set these if you want to override the defaults:

```bash
VITE_GAMMA_API_BASE_URL=
VITE_DATA_API_BASE_URL=
VITE_CLOB_API_BASE_URL=
VITE_POLYMARKET_MARKET_WS_URL=
```

## Verification

Run:

```bash
npm run lint
npm run build
```

## Current limitation

If your local network or machine cannot establish TLS connections to Polymarket, local preview may still fail even though the Vercel deployment works for other users. That is a network-path problem, not a frontend build problem.
