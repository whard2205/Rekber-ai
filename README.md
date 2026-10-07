# Rekber AI

**A rekber that can't run off with your money: funds held by a smart contract, disputes settled by an AI agent.**

Built for the [Indonesia Web3 Hackathon 2026](https://indonesiaweb3hack.xyz) (Binance Academy × BNB Chain × Coinvestasi) — AI Agents / Finance & Commerce track.

---

## The problem

Millions of trades in Indonesia happen outside marketplaces — Facebook groups, Instagram, WhatsApp, gaming communities — where there is no escrow. Online shopping fraud is the **#1 scam type** reported to Indonesia's Anti-Scam Centre (IASC, OJK): 53,928 reports between Nov 2024 and Oct 2025, out of ~299,000 total scam reports and Rp7 trillion in losses.[^1] People rely on "rekber" (rekening bersama, a middleman who holds the money), but fake rekber is itself a documented scam pattern,[^5][^6] licensed rekber services still hold your money and settle disputes manually,[^7] and even inside real marketplaces the infamous "ordered a phone, received a brick" cases end with the shop and the courier blaming each other — because nobody collected evidence of who cheated.[^4]

## The solution

Rekber AI replaces the human middleman with two things a smart contract and an AI agent are actually good at:

1. **The money is locked in a BNB Chain smart contract.** Nobody — including us — can withdraw it. The relayer that pays gas on the user's behalf cannot move funds without the buyer's or seller's own signature.
2. **An AI agent judges the evidence.** The seller must photograph the real item next to a unique deal code before shipping (not just a sealed box). If the buyer confirms, or stays silent until the window closes, funds release to the seller. If the buyer disputes, the AI arbiter compares the seller's promised spec, the packing photo and the buyer's unboxing photo, then autonomously refunds or releases on-chain — or escalates to a human when unsure. Every verdict is committed on-chain as a hash of its reasoning, so anyone can recompute it and check it against the event log.

Full write-up (rules of evidence, competitor analysis, regulatory notes, sources): [`docs/rekber-ai/BLUEPRINT.md`](https://github.com/whard2205/Rekber-ai/blob/main/docs/rekber-ai/BLUEPRINT.md).

## Live on BSC Testnet

Web app: **https://rekber-ai.vercel.app** (Vercel, data in Upstash Redis). The AI arbiter agent is a long-running daemon, so it runs separately (`cd agent && npm start`) against the same Redis — see `KV_REST_API_URL` in `.env.example`.

| Contract | Address | Status |
|---|---|---|
| `RekberEscrow` | [`0x7B864B0ca344d638E1aBB5323A4913Cd5BA1d3E7`](https://testnet.bscscan.com/address/0x7B864B0ca344d638E1aBB5323A4913Cd5BA1d3E7#code) | Verified |
| `MockIDRX` (test token, 0 decimals — matches real IDRX) | [`0xb93bEfc82B86a2dE25ece770D54Fb4aFE73909c3`](https://testnet.bscscan.com/address/0xb93bEfc82B86a2dE25ece770D54Fb4aFE73909c3#code) | Verified |

Live run, deal `RKB-DVYEM5` (7 Oct 2026): listed iPhone 15, a closed box as packing proof, a lotion bottle at unboxing. The AI judged it from the photos and refunded the buyer on-chain.

| Step | Transaction |
|---|---|
| Funded — buyer pays (gasless, relayer-submitted) | [`0xe992dab0…`](https://testnet.bscscan.com/tx/0xe992dab05c4d8e5f9686a321e13abb588ebdaa3976728bcfd0be694fc0d4e135) |
| Shipped — seller's packing evidence hash | [`0xa2eb8d0b…`](https://testnet.bscscan.com/tx/0xa2eb8d0ba1df779b5c398eaad1a29bad6cc58e198543cebcdbb2f695bf5ea287) |
| Disputed — buyer's unboxing evidence hash | [`0x0f4ea95d…`](https://testnet.bscscan.com/tx/0x0f4ea95d2a54071a396afa265f4a821464088736fa4ed191f44af11dde87cd6c) |
| Refunded — **AI verdict** (REFUND, confidence 0.90), sent by the agent's own wallet with `verdictHash 0x68b5ab1d…` | [`0x779be38f…`](https://testnet.bscscan.com/tx/0x779be38f81ef82555f4faed4c7331495a2f38d6c4054ab95a46b2e9cbd721991) |

## Architecture

![Deal lifecycle: Funded, Shipped, Disputed and Escalated, ending in Released, Refunded or a 50/50 Split](https://raw.githubusercontent.com/whard2205/Rekber-ai/main/docs/rekber-ai/diagrams/01-deal-lifecycle.svg)

![System architecture: phones, web app + relayer, evidence store, AI arbiter agent, RekberEscrow on BNB Chain, human arbiter](https://raw.githubusercontent.com/whard2205/Rekber-ai/main/docs/rekber-ai/diagrams/02-architecture.svg)

### How the agent decides a dispute

The model never gets the last word on its own: two cheap checks run around it, and anything short of a confident, well-formed answer goes to a human.

![How the AI agent settles a dispute: recycled-photo check, vision model, confidence gate of 0.85, escalate to a human otherwise](https://raw.githubusercontent.com/whard2205/Rekber-ai/main/docs/rekber-ai/diagrams/03-ai-dispute-decision.svg)

### Trust model

| Party | Has to trust | Mitigation |
|---|---|---|
| Buyer | Seller ships the item | Funds are locked; not shipped → automatic refund |
| Seller | Buyer doesn't withhold confirmation forever | Buyer silent past the window → funds auto-release to seller |
| Both | The AI judges fairly | Public rules of evidence, confidence gate, escalation to a human, reasoning + verdictHash committed on-chain |
| Both | The operator (relayer / arbiter) | Relayer can't act without the user's own signature; the arbiter can only choose refund/release/escalate — it can never divert funds; if the operator disappears, an unresolved dispute splits 50/50 automatically |
| Both | Evidence storage on our server | Only the hash is on-chain; raw photos are never published on-chain. Roadmap: BNB Greenfield/IPFS |

### Why blockchain, why AI

| Question | Answer |
|---|---|
| Why blockchain? | The core problem is a party that can run off with the money. Here, the contract holds it — we can't touch it either. The relayer only pays gas; without the buyer's/seller's own signature it can't do anything. Every verdict is publicly checkable on BscScan. |
| Why AI? | Judging photo evidence used to require a human admin on call. The agent reads the packing/unboxing photos, compares them against the seller's promised spec, and decides in seconds — with a written reason. |
| Why an *agent*, not just a model? | It runs autonomously: watches the contract, collects evidence, waits for the seller's response window, decides, **executes the on-chain settlement with its own wallet**, and knows when to escalate. |

## Running locally

Requires Node ≥ 22.5 (`node:sqlite`-free here, but the agent uses `node:test`; no exotic runtime needs).

```bash
# 1. Contracts — local chain + deploy
cd contracts && npm install
npm run node                 # terminal 1: local chain on :8545
npm run deploy:localhost     # terminal 2: deploys MockIDRX + RekberEscrow
npm run export-abi           # writes ABIs into agent/ and web/

# 2. Agent — the AI arbiter daemon
cd ../agent && npm install
cp .env.example .env         # AI_ARBITER_PRIVATE_KEY = hardhat account #1 for local
npm start                    # polls every POLL_MS, mock provider by default

# 3. Web — what buyers and sellers use
cd ../web && npm install
cp .env.example .env         # RELAYER_PRIVATE_KEY = hardhat account #2 for local
npm run dev                  # http://localhost:3001
```

### Tests

```bash
cd contracts && npx hardhat test        # 61 passing — full state machine, signature paths, fee math
cd agent      && npm test               # 16 passing — judge gating, verdict hashing, shipment check
cd agent      && npm run typecheck
cd web        && npm run typecheck && npm run build
cd web        && npm run smoke          # scripts/smoke-test.mjs — 5 e2e scenarios over real HTTP + chain:
                                         # direct confirm, AI REFUND, AI RELEASE + seller response,
                                         # ESCALATE -> human-resolve.ts, confirm-timeout auto-release
```

### BNB Smart Chain testnet

```bash
cd contracts
# fill .env: DEPLOYER_PRIVATE_KEY, AI_ARBITER_ADDRESS, HUMAN_ARBITER_ADDRESS, FEE_RECIPIENT, ETHERSCAN_API_KEY
npx hardhat run scripts/deploy.js --network bscTestnet
npx hardhat verify --network bscTestnet <escrow address> <constructor args...>
```

Then set in both `agent/.env` and `web/.env`: `CHAIN_ID=97`, `RPC_URL`, `ESCROW_ADDRESS`, `TOKEN_ADDRESS` (from `contracts/deployments/bscTestnet.json`), and in `web/.env` also `NEXT_PUBLIC_EXPLORER_URL=https://testnet.bscscan.com`.

### Environment variables

| Var | Where | Purpose |
|---|---|---|
| `AI_ARBITER_PRIVATE_KEY` | agent | Wallet that calls `resolve`/`escalate` on-chain |
| `AI_PROVIDER` | agent, web | `mock` \| `openai` \| `aimlapi` — mock is deterministic (`[MOCK]`-labeled), never used for judged demos |
| `AIMLAPI_API_KEY` / `AIMLAPI_MODEL` | agent, web | Real vision provider (AI/ML API, OpenAI-compatible proxy) |
| `CONFIDENCE_THRESHOLD` | agent | Verdicts below this confidence escalate to a human instead of auto-settling (default 0.85) |
| `SELLER_RESPONSE_SECONDS` | agent, web | How long the seller has to respond to a dispute before the AI judges without it |
| `HUMAN_ARBITER_PRIVATE_KEY` | agent (CLI script only) | Used by `agent/scripts/human-resolve.ts`, never by the daemon |
| `RELAYER_PRIVATE_KEY` | web | Pays gas for `fundWithSig`/`act` so users never need a funded wallet |
| `RPC_URL`, `CHAIN_ID`, `ESCROW_ADDRESS`, `TOKEN_ADDRESS` | agent, web | Chain targeting, fully env-configurable |
| `NEXT_PUBLIC_EXPLORER_URL` | web | Explorer base for tx links (empty on localhost) |
| `DEPLOYER_PRIVATE_KEY`, `AI_ARBITER_ADDRESS`, `HUMAN_ARBITER_ADDRESS`, `FEE_RECIPIENT`, `ETHERSCAN_API_KEY` | contracts | Testnet/mainnet deployment + verification |

## Known limitations (honest, on purpose)

- **MVP payment token is Mock IDRX**, not the real IDRX stablecoin on BNB Chain. The real IDRX contract has 0 decimals but **does not support EIP-2612 `permit`** (verified directly against the mainnet contract) — a production gasless flow for real IDRX needs `approve` sponsored via a paymaster (MegaFuel) or EIP-7702, not the permit signature this demo uses.
- **Evidence photos live in the operator's storage** (Upstash Redis in the deployed app, `data/` files locally), addressed by content hash. Only the hash is committed on-chain. Roadmap: IPFS/BNB Greenfield.
- **No cash-out to rupiah yet.** On/off-ramp is a post-hackathon integration, not a prototype claim.
- **The legal status of a non-custodial "rekber" is not settled** in Indonesian law (running a rekber is a regulated activity under UU No. 3/2011; our argument is that a non-custodial contract never holds funds the way a traditional rekber does, but there is no ruling on this). See `docs/rekber-ai/BLUEPRINT.md` §8.
- **The AI can be wrong.** It only auto-settles when confident (≥0.85); anything ambiguous, malformed, or below threshold escalates to a human — it never guesses with money on the line.

## Roadmap

Real IDRX + licensed on/off-ramp + PJP partnership · gas sponsorship for IDRX `approve` via MegaFuel/EIP-7702 · courier tracking API integration · appeal to a human arbiter panel · on-chain seller reputation · WhatsApp bot · evidence storage on BNB Greenfield · ERC-8004 agent identity.

## License

MIT (hackathon prototype).

[^1]: Databoks/Katadata, citing IASC data, 21 Oct 2025 — https://databoks.katadata.co.id/en/finance/statistics/68f74ef7e7454/online-shopping-fraud-the-most-common-scam-in-indonesia
[^4]: Liputan6, 27 Oct 2021 — https://www.liputan6.com/hot/read/4694788/beli-hp-rp-25-juta-di-online-shop-wanita-ini-malah-dapat-kotak-berisi-batu
[^5]: Metrotoday, 19 May 2026 — https://www.metrotoday.id/nasional/2026/05/19/modus-penipuan-jual-beli-akun-game-online-marak-kerugian-capai-triliunan-rupiah/
[^6]: Hukumonline, 1 Aug 2022 — https://www.hukumonline.com/klinik/a/tips-jika-menjadi-korban-penipuan-rekber-lt62e7a5e9aad1a/
[^7]: RekberPay — https://rekberpay.com/?lang=en
