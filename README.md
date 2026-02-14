# Agentic Token Lab

This repository is a lean, experimental protocol for daily game-theoretic token experiments.

## What was reviewed

### `https://ethskills.com/SKILL.md`
- The doc set is a strong anti-hype baseline: Ethereum is now materially cheaper than many assume.
- Current chain economics assumptions include Base/mainnet L2 costs on the order of milli-USD transactions and 8s blocks on mainnet.
- ERC-8004 and x402 are already live and directly useful for long-lived autonomous agents.

### `https://docs.bankr.bot/`
- Bankr supports 60% deployer / 40% platform fee routing on Base token launches.
- Base vaulting supports up to 90% lock with minimum 7-day lock and vesting.
- Fee routing to custom recipients is explicit and reversible via transfer of fee ownership.
- For this build, we mirror their successful vaulting + fee model internally and avoid platform dependency.

## Protocol model

- Token: fixed supply ERC-20 with configurable transfer rake.
- Rake flow: default **1%** on taxable transfers.
- 100% of collected rake is forwarded to a `StakeVault` and allocated exclusively to stakers.
- Stakers are weighted by locked amount and lock duration.
- Lock boost: linear up to a configurable max multiplier; genesis lock is designed around 12x at 365 days.
- Distribution is naturally leaderboard-like via rank-aware `getLeaderboard`.

## Supply and lock plan

- 51% of supply is routed to the team vault and locked for 365 days.
- 49% is left in a tradeable bucket for liquidity strategy.
- The team lock creates boosted voting power by duration-weighted staking math.

## Folder layout

- `contracts/ExperimentToken.sol` — token, transfer-tax logic, fee forwarding to vault.
- `contracts/StakeVault.sol` — lock staking and rewards accounting.
- `contracts/ExperimentController.sol` — one-click daily experiment tuning.
- `scripts/deploy.js` — deterministic deployment + bootstrap (51/49 split).
- `scripts/run-daily-experiment.js` — autonomous experiment rotation.
- `scripts/monitor.js` — zero-human invariant checks for CI.
- `frontend/` — bold dashboard with leaderboard and position view.
- `.github/workflows/` — CI, scheduled daily experiment, scheduled monitor checks.

## Run locally

```bash
npm install
npx hardhat compile
npm test
```

## Deploy

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export BASE_SEPOLIA_RPC_URL=https://...
npm run deploy
```

The deploy script prints deployed addresses for vault/controller/token.

## Zero-touch operating model

1. Set repository variables/secrets for:
   - `TOKEN_ADDRESS`
   - `VAULT_ADDRESS`
   - `TEAM_WALLET`
   - `CONTROLLER_ADDRESS`
   - RPC URLs and deployer key for Base or Base Sepolia
2. Enable three workflows:
   - `protocol-ci` for PR checks
   - `daily-experiment-rollout` for autonomous experiment changes
   - `zero-touch-monitor` for recurring invariant checks
3. Configure a bot/notification hook from CI failures (Slack/email/GitHub alerts).

No manual action is required per-day once the scheduled jobs and keys are configured.

## Automated safety rails (Trail of Bits-inspired)

- On each scheduled experiment run, the workflow now executes `scripts/monitor.js` immediately after `startExperiment`.
- `scripts/monitor.js` enforces protocol invariants:
  - supply exists
  - non-zero locked principal and weight
  - non-empty leaderboard
  - multiplier cap floor checks
  - team lock continuity and minimum boost
  - vault accounting sanity (`balance >= locked`)
- `monitor.yml` can be used independently for 15-minute heartbeat checks.

## Frontend

`frontend/index.html` is a direct single-page dashboard and can be deployed to any static host.

To replace placeholders:
- set `TOKEN_ADDRESS` and `VAULT_ADDRESS` in `frontend/app.js` before build, or provide
  `?token=...&vault=...` URL parameters when opening `index.html`.
- then open `frontend/index.html` with a wallet-enabled browser.
