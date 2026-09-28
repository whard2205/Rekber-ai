# MANDOR ⛑️

**MANDOR is a BNB-native human execution and verifiable proof layer for autonomous AI agents.**

An AI agent can autonomously create a real-world task, fund an IDRX escrow on-chain, accept a human worker, verify tamper-resistant photo evidence through a layered anti-cheat pipeline, and release payment — with every decision auditable.

> *Mandor* (Indonesian): a foreman — the person who coordinates workers and makes sure they get paid.

---

## Why

AI agents can reason, browse, and pay — but they cannot see or act in the physical world. Checking a price in a warung, photographing a road condition, confirming a store is actually open: the real world has no API. Humans are that API — but the existing rails for "humans working for AI pipelines" are broken. The Washington Post [documented](https://www.washingtonpost.com/world/2023/08/28/scale-ai-remotasks-philippines-artificial-intelligence/) how data-labeling workers in Southeast Asia routinely had payments delayed, reduced, or cancelled with no recourse.

MANDOR fixes both sides structurally:

- **For agents**: a programmatic way to buy verified physical-world execution.
- **For workers**: wages locked in escrow *before* work starts, instant on-chain bounty settlement in IDRX (Indonesian Rupiah stablecoin), and a contract-level guarantee (`forceRelease`) that pays the worker automatically if the agent goes silent after evidence is submitted.

## What it is NOT

Honest scope, stated up front:

- **Not the first AI-to-human task product.** [RentAHuman](https://rentahuman.ai), [HUMAN Protocol](https://humanprotocol.org), and [Payman](https://paymanai.com) exist. See [Competitive landscape](#competitive-landscape).
- **Not "trustless AI verification."** The verifier is an **off-chain oracle operated by the agent** — a trust assumption we make explicit and mitigate (see [Trust model](#trust-model)).
- **Not a wage/employment product.** Rewards are on-chain bounty settlements, not salaries; regulatory treatment of gig bounties varies by jurisdiction.

---

## Golden path

```
Agent (Claude)                     Chain (BSC)                    Human worker (phone)
──────────────                     ───────────                    ────────────────────
1. receives goal
2. plans tasks that need humans
3. generates anti-cheat challenge
   code per task (in specHash) ──► postTask() locks IDRX
                                   in TaskEscrow
                                                                  4. opens task page (QR/link)
                                                                  5. burner wallet auto-created
                                                    claimFor() ◄─ 6. taps "Ambil Kerjaan"
                                                    (relayer pays gas — worker needs no ETH/BNB)
                                                                  7. photographs proof WITH the
                                                                     challenge code visible
                                              submitProofFor() ◄─ 8. uploads photo
                                   (keccak256 of file = on-chain proofHash)
9. layered verification:
   size → deadline → duplicate
   registry → vision model →
   schema validation →
   confidence gate
10a. APPROVE ────────────────────► releaseBounty() pays worker
10b. REJECT  ────────────────────► rejectAndReopen() (funds stay locked)
11. structured verdict + tx hash
    appended to audit log                                         12. sees payout + explorer link
```

**If the agent crashes or stalls after step 8**, anyone can call `forceRelease()` after the verify window (default 24 h) and the worker is paid. The agent can never withdraw funds once evidence is submitted — its only moves are *pay* or *reopen*.

---

## Architecture

| Workspace | Stack | Role |
|---|---|---|
| [`contracts/`](contracts/) | Solidity 0.8.24, Hardhat, OpenZeppelin | `TaskEscrow` state machine (`Open → Claimed → Submitted → Paid/Refunded`) + `MockIDRX` test token (2 decimals, matching IDRX) |
| [`agent/`](agent/) | TypeScript, viem, `@anthropic-ai/sdk` | Autonomous employer: plans tasks (structured outputs), posts escrow, watches chain, runs the verification pipeline, settles — no human operator in the loop |
| [`worker-app/`](worker-app/) | Next.js 15, viem | Mobile PWA for workers + relayer API (server holds relayer key, pays gas for `claimFor`/`submitProofFor`) + **`/panggung` stage screen** (projector view: live task status, agent decision feed, QR for the audience) |

The AI provider sits behind a `ModelVerifier` interface ([`agent/src/verifier.ts`](agent/src/verifier.ts)): `AnthropicModelVerifier` (primary), `OpenAIModelVerifier` (vendor fallback, e.g. `gpt-4o`, via `VERIFIER_PROVIDER=openai`), and `MockModelVerifier` (deterministic byte rules, clearly `[MOCK]`-labeled) for offline testing. The financial gate (`parseModelVerdict` + confidence threshold) applies identically to every provider.

### Layered anti-cheat verification

| Layer | Mechanism | Catches |
|---|---|---|
| 1 | Per-task **challenge code** generated by the agent (not the model), committed on-chain inside `specHash` | Recycled/stock photos — the code must be visibly written in the photo |
| 2 | File type + 8 MB size validation (API and pipeline) | Malicious/absurd uploads |
| 3 | Exact-hash **duplicate check** at upload (HTTP 409) + cross-task **proof registry** in the agent | Same photo reused across tasks |
| 4 | Deadline check — enforced **on-chain** in `TaskEscrow._submit` (reverts `DeadlinePassed`) and cross-checked off-chain against `submittedAt` | Late submissions |
| 5 | Multimodal model evaluation returning **strict JSON**, schema-validated before any financial action | Irrelevant photos, screenshots, unmet criteria |
| 6 | **Confidence gate** (`CONFIDENCE_THRESHOLD`, default 0.8): ambiguous = REJECT, funds stay in escrow | Model uncertainty being exploited |
| 7 | **Verification cap** per task (`MAX_VERIFICATIONS_PER_TASK`, default 5) | Resubmission spam burning API budget |

Verdicts are structured (`challengeMatched`, `requirementsMatched`, `duplicateDetected`, `confidence`, `decision`, `reasons[]`, `evidenceHash`) and every decision is appended to `agent/missions/audit-log.jsonl` with the worker address and settlement tx hash — **auditable agent decisions**, not a black box. A `verdictHash` (`keccak256` of the verdict's decision, reasons, confidence, evidence hash and verifier name) is committed on-chain in the `BountyReleased`/`TaskReopened` events for **every** APPROVE and REJECT, so a REJECT's reasoning is publicly checkable too, not just the paid ones — anyone can recompute the hash from the audit log and match it against the explorer.

A `TaskEscrow`-level liveness guard: a task stuck `Claimed` with no proof for longer than `claimWindow` (default 10 min) can be claimed by another worker — one stale claim can't freeze a task until its full deadline.

### Trust model

Stated explicitly, because "trustless AI" is not a thing:

| Party | Trusts | Mitigation |
|---|---|---|
| Worker | Agent to verify honestly | `forceRelease`: agent silence past the verify window = worker gets paid, enforced by the contract; rejected work reopens with reasons shown in the app |
| Worker | Relayer to relay claims/submissions | Worker may also call `claimTask`/`submitProof` directly on-chain with their own gas |
| Agent | Its own verifier oracle (it runs it) | — |
| Both | Photo storage on the operator server | Only `keccak256` evidence hashes go on-chain; raw photos and PII are **never** published on-chain. IPFS/CID storage is the documented upgrade path |

---

## Running locally

Prereqs: Node 20+.

```bash
# 1. Contracts — local chain + deploy
cd contracts && npm install
npm run node                 # terminal 1: local chain on :8545
npm run deploy:localhost     # terminal 2: deploys MockIDRX + TaskEscrow, funds agent
npm run export-abi

# 2. Agent — the autonomous employer
cd ../agent && npm install
cp .env.example .env         # fill AGENT_PRIVATE_KEY (hardhat account #0 for local)
                             # MANDOR_MOCK_BRAIN=1 to run without an API key
npm start -- "Saya butuh 2 foto jempol dari pengunjung venue"

# 3. Worker app — what humans use
cd ../worker-app && npm install
cp .env.example .env         # fill RELAYER_PRIVATE_KEY (hardhat account #0 for local)
npm run dev                  # http://localhost:3001, open from a phone on the same LAN
```

### Tests

```bash
cd contracts  && npm test    # 28 escrow state-machine tests (TDD)
cd agent      && npm test    # 15 verifier pipeline unit tests
cd agent      && npm run typecheck
cd worker-app && npm run typecheck
cd worker-app && node scripts/smoke-test.mjs   # 5-scenario e2e over real HTTP + chain:
                                               # wrong-challenge reject, approve+payout,
                                               # duplicate 409, second payout, history
```

### BNB Smart Chain testnet

```bash
cd contracts
BSC_TESTNET_RPC_URL=... DEPLOYER_PRIVATE_KEY=... npx hardhat run scripts/deploy.js --network bscTestnet
```

Then set in both `agent/.env` and `worker-app/.env`: `CHAIN_ID=97`, `RPC_URL`, `ESCROW_ADDRESS`, `TOKEN_ADDRESS` (from `contracts/deployments/bscTestnet.json`), and `NEXT_PUBLIC_EXPLORER_URL=https://testnet.bscscan.com`.

For a mainnet demo with real IDRX, verify the official IDRX contract address on BNB Chain against [IDRX documentation](https://idrx.co) first — never hardcode token addresses or assume decimals (the code reads amounts in the token's smallest unit; MockIDRX mirrors IDRX's 2 decimals).

### Environment variables

| Var | Where | Purpose |
|---|---|---|
| `AGENT_PRIVATE_KEY` | agent | Agent wallet (posts tasks, pays bounties) |
| `ANTHROPIC_API_KEY` | agent | Claude API (planning + vision verification) |
| `ANTHROPIC_MODEL` / `VERIFIER_MODEL` | agent | Planning / verification models (verification may use a cheaper model) |
| `PLANNER_PROVIDER` | agent | `anthropic` \| `aimlapi` \| `mock` — provider abstraction for planning (goal -> task list), independent of `VERIFIER_PROVIDER` |
| `VERIFIER_PROVIDER` | agent | `anthropic` \| `openai` \| `aimlapi` \| `mock` — provider abstraction for verification |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | agent | Only when `VERIFIER_PROVIDER=openai` (default model `gpt-4o`) |
| `AIMLAPI_API_KEY` / `AIMLAPI_MODEL` | agent | Only when `PLANNER_PROVIDER=aimlapi` and/or `VERIFIER_PROVIDER=aimlapi` (AI/ML API — OpenAI-compatible proxy) |
| `NEXT_PUBLIC_WORKER_URL` | worker-app | URL encoded into the `/panggung` QR (empty = LAN IP auto-detect) |
| `MANDOR_MOCK_BRAIN` | agent | `1` = deterministic offline mode, clearly `[MOCK]`-labeled |
| `CONFIDENCE_THRESHOLD` | agent | Min model confidence for APPROVE (default 0.8) |
| `MAX_VERIFICATIONS_PER_TASK` | agent | Anti-spam verification cap (default 5) |
| `RELAYER_PRIVATE_KEY` | worker-app | Pays gas so workers need no crypto |
| `RPC_URL`, `CHAIN_ID`, `ESCROW_ADDRESS`, `TOKEN_ADDRESS` | both | Chain targeting — fully env-configurable, no hardcoded addresses |
| `NEXT_PUBLIC_EXPLORER_URL` | worker-app | Explorer base for tx links (empty on localhost) |
| `BSC_TESTNET_RPC_URL`, `DEPLOYER_PRIVATE_KEY` | contracts | Testnet deployment |
| `RELAYER_ADDRESS`, `VERIFY_WINDOW`, `CLAIM_WINDOW`, `AGENT_ADDRESS` | contracts (deploy script only) | `TaskEscrow` constructor args — `VERIFY_WINDOW` default 24h (forceRelease), `CLAIM_WINDOW` default 10min (a stale Claimed task with no proof can be taken over by another worker) |

---

## Competitive landscape

| Product | What it is | How MANDOR differs |
|---|---|---|
| **RentAHuman** | Marketplace where AI agents hire humans (MCP-based) | MANDOR is an **execution + proof layer**, not just matching: challenge-code evidence, layered verification, escrow with worker-protection (`forceRelease`), IDRX settlement, Indonesia-first |
| **HUMAN Protocol** | Generic on-chain job market infrastructure (since 2021) | Not agent-native: no autonomous requester that plans, verifies, and settles without human ops |
| **Payman** | AI-to-human payments API (Visa-backed), fiat rails | Closed fintech rails; MANDOR is on-chain escrow with contract-enforced worker recourse and public audit trail |
| **Gig marketplaces** (Upwork/Fastwork/etc.) | Human-to-human, manual review, T+days payouts | No API for agents, no programmatic verification, no instant settlement |

**Differentiation:** Indonesia-first execution network · IDRX-denominated rewards · BNB-native settlement · challenge-bound photo proof · layered anti-cheat · auditable agent decisions (JSONL + on-chain events) · provider-agnostic verifier.

### ERC-8004 / ERC-8183 compatibility path

[ERC-8004](https://blog.quicknode.com/erc-8004-a-developers-guide-to-trustless-ai-agent-identity/) (trustless agent identity/reputation/validation registries) and [ERC-8183](https://www.decipherclub.com/so-what-exactly-are-trustless-agents-up-to/) (agentic commerce escrow with reputation gating) are the emerging standards here; BNB Chain ships a [Python agent SDK](https://github.com/bnb-chain/bnbagent-sdk) around ERC-8004. We deliberately did **not** bolt these on for the deadline (our stack is TypeScript; a rushed integration would be buzzword-ware). The clean path, documented for production:

1. Register the MANDOR agent in the ERC-8004 Identity Registry on BNB (one ERC-721 mint; agent wallet already exists).
2. Emit worker feedback into the Reputation Registry after each settlement (data already in our audit log).
3. Adapt `TaskEscrow` to an ERC-8183 provider flow once the standard's human-provider ergonomics stabilize — our state machine (`FUNDED → CLAIMED → SUBMITTED → VERIFIED → PAID/REJECTED`) maps 1:1.

---

## Known limitations (prototype honesty)

- **Task spec transport is a local file** (`agent/missions/current.json` read by the worker-app). Single-machine demo constraint; production path is IPFS/CID with the on-chain `specHash` as commitment (already committed on-chain today).
- **Proof storage is the operator's disk**, addressed by hash. Production: IPFS/Pinata via the same `getProof` interface.
- **Geofence validation is not implemented** — the schema supports location-bound tasks; browser geolocation capture is the next increment.
- **No perceptual hashing** — duplicate detection is exact-hash; near-duplicate (re-encoded) photos rely on the challenge code + vision layer.
- **Verifier is a single oracle** — see Trust model; multi-verifier quorum is future work.
- **Mock mode exists** for offline dev/tests and is loudly labeled; judged demos run the real vision pipeline.
- **Regulatory**: bounty settlement in stablecoins is not employment/wage processing; Indonesian e-money and labor regulations may apply to a production operator.

## License

MIT (hackathon prototype).
