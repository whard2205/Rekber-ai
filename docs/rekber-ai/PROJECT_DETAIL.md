# Rekber AI

**Rekber yang tidak bisa kabur membawa uangmu — a rekber that can't run off with your money.** The buyer's money is locked in a BNB Chain smart contract, and disputes are settled by an AI agent that settles on-chain with its own wallet. Nobody, including us, can run off with the money.

- **Demo video (2:15):** https://www.youtube.com/watch?v=gYAv-NHmSQw
- **Live app:** https://rekber-ai.vercel.app
- **Contract:** [`RekberEscrow` 0x7B864B0ca344d638E1aBB5323A4913Cd5BA1d3E7](https://testnet.bscscan.com/address/0x7B864B0ca344d638E1aBB5323A4913Cd5BA1d3E7#code) (BSC Testnet, verified)
- **Code:** https://github.com/whard2205/Rekber-ai

## The problem

Online-shopping fraud is the most-reported scam type in Indonesia: **53,928 reports** to the Anti-Scam Centre (IASC, OJK) between Nov 2024 and Oct 2025, out of ~299,000 scam reports and Rp7 trillion lost ([Databoks/Katadata](https://databoks.katadata.co.id/en/finance/statistics/68f74ef7e7454/online-shopping-fraud-the-most-common-scam-in-indonesia)).

Outside Shopee and Tokopedia — Facebook groups, Instagram, WhatsApp, game-account trades — there is no escrow, so people use a **rekber** (rekening bersama): a middleman who holds the money. That breaks in three ways:

1. **Rekber bodong.** The "middleman" is part of the scam ([Hukumonline](https://www.hukumonline.com/klinik/a/tips-jika-menjadi-korban-penipuan-rekber-lt62e7a5e9aad1a/), [Metrotoday](https://www.metrotoday.id/nasional/2026/05/19/modus-penipuan-jual-beli-akun-game-online-marak-kerugian-capai-triliunan-rupiah/)).
2. **Legit rekber still holds your money**, and an admin decides disputes by hand.
3. **Nobody collects evidence.** In the well-known "pesan HP, yang datang batu" case, a buyer paid Rp2.5 million for a phone and opened a box of stones; the shop and the courier blamed each other ([Liputan6](https://www.liputan6.com/hot/read/4694788/beli-hp-rp-25-juta-di-online-shop-wanita-ini-malah-dapat-kotak-berisi-batu)).

## The solution

A stranger trade needs someone to hold the money and someone to judge the evidence. Rekber AI replaces both with things that can't run off with it:

- **A contract holds the funds.** The relayer pays gas for the user, but it cannot move anything without the buyer's or seller's own signature.
- **An AI agent judges the evidence.** The seller must photograph the actual item next to a unique deal code before shipping; the buyer photographs the unboxing with the same code. On a dispute, the agent compares the seller's signed promise with the listing, packing, shipping-label, unboxing and seller-reply photos, then refunds, releases, or hands the case to a human.

Users install nothing and pay no gas: a signing key is created in the browser and never leaves it.

## How it works

![Deal lifecycle: Funded, Shipped, Disputed and Escalated, ending in Released, Refunded or a 50/50 Split](https://raw.githubusercontent.com/whard2205/Rekber-ai/main/docs/rekber-ai/diagrams/01-deal-lifecycle.svg)

Every deal ends Released, Refunded or Split. The timeout paths (not shipped → refund, buyer silent → release, dispute unresolved → 50/50) can be triggered by anyone, so no money gets stuck even if our server goes down.

![System architecture: phones, web app + relayer, evidence store, AI arbiter agent, RekberEscrow on BNB Chain, human arbiter](https://raw.githubusercontent.com/whard2205/Rekber-ai/main/docs/rekber-ai/diagrams/02-architecture.svg)

## Why it's an agent, not a model call

The agent runs on its own: it watches the contract, waits out the seller's reply window, collects the evidence, decides, and **executes the settlement on-chain from its own wallet** (`aiArbiter`). It also knows when not to decide:

![How the AI agent settles a dispute: recycled-photo check, vision model, confidence gate of 0.85, escalate to a human otherwise](https://raw.githubusercontent.com/whard2205/Rekber-ai/main/docs/rekber-ai/diagrams/03-ai-dispute-decision.svg)

- **Layer 1, before any AI call:** an unboxing photo already used in another deal is treated as likely recycled → escalate.
- **Layer 2:** the vision model reads every photo against the seller's promised spec.
- **Layer 3:** the model only rates each side's evidence (strong or weak). Code applies the public rules to those ratings, and only a well-formed answer with confidence **≥ 0.85** settles automatically; anything else goes to a human arbiter.

**Calibrated on real photos:** 9 of 9 correct verdicts across three consecutive rounds (refund, release against a buyer who lied about a scratch, and escalation for a likely courier swap), 4–6 seconds each. The first round scored 1 of 3; what we changed and why is documented in [`CALIBRATION.md`](https://github.com/whard2205/Rekber-ai/blob/main/docs/rekber-ai/CALIBRATION.md).

Each verdict is hashed (`keccak256` of the written decision and reasons) and stored on-chain with the settlement, so anyone can recompute it and check it against the event log. The contract also limits the AI: it can refund, release or escalate, but it can never send funds anywhere else, and it cannot overrule a case once a human has it.

## Trust model

| Party | Has to trust | Why they don't have to |
|---|---|---|
| Buyer | Seller ships | Not shipped in time → automatic refund |
| Seller | Buyer confirms | Buyer silent past the window → automatic release |
| Both | The AI is fair | Evidence rules are public, confidence gate, human escalation, verdict hash on-chain |
| Both | The operator | Relayer needs the user's signature; arbiter can't divert funds; unresolved disputes split 50/50 |

## Business model

**1% fee, only when money is released to the seller.** Refunds and 50/50 splits are free, so we only earn when an honest trade completes. Independent rekber usually charge around 1–5% and need an admin awake to do it.

## Built with

- **Contract:** Solidity on BNB Smart Chain Testnet — EIP-712 signed offers and actions, EIP-2612 `permit` for gasless funding, relayer-submitted transactions.
- **AI agent:** TypeScript daemon with a vision model, three-layer decision gate, crash-safe verdict resubmission.
- **Web:** Next.js on Vercel, Upstash Redis for deals and evidence (photos stay off-chain; only their hashes go on-chain).
- **Tests:** 61 contract tests, 17 agent tests, and a 5-scenario end-to-end run (direct confirm, AI refund, AI release after seller reply, escalation to a human, auto-release on timeout).

## What we're not claiming

- **The token is Mock IDRX on testnet.** Crypto isn't legal tender in Indonesia; the production path is real IDRX with a licensed on/off-ramp and a licensed payment partner (PJP) or the OJK sandbox. Real IDRX has no `permit`, so production gasless funding needs a paymaster (MegaFuel) or EIP-7702.
- **Running a rekber is regulated** (UU No. 3/2011). Our contract never holds funds the way a rekber operator does, but there is no ruling on non-custodial escrow yet.
- **The AI can be wrong.** That's why it only settles at ≥ 0.85 and escalates everything else.

## Roadmap

Real IDRX + licensed on/off-ramp · gas sponsorship via MegaFuel/EIP-7702 · courier tracking API · human arbiter appeal panel · on-chain seller reputation · WhatsApp bot · evidence on BNB Greenfield · ERC-8004 agent identity.

*Team Gedung Hijau*
