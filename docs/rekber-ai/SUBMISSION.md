# Rekber AI — submission form draft

Copy-paste source for indonesiaweb3hack.xyz/id/submit. English throughout (per docs/rekber-ai/PLAN.md R-14).
Team: Gedung Hijau.

---

**Nama Project**
> Rekber AI

**Tagline (satu kalimat)**
> Non-custodial escrow with an AI arbiter for Indonesian social commerce — funds locked in a smart contract, disputes settled by AI, no admin who can run off with your money.

**Track**
> AI Agents, Finance & Commerce

**Contract Address**
> `0x7B864B0ca344d638E1aBB5323A4913Cd5BA1d3E7`

**Network**
> BNB Smart Chain **Testnet** (chain id 97) — confirm the form's Network dropdown has a Testnet option before submitting; do not select Mainnet.

**Logo Project**
> Upload [`docs/rekber-ai/logo/logo.png`](logo/logo.png) (1024×1024). Source: [`logo.svg`](logo/logo.svg) — a padlock whose face is a balance scale: the money is locked, the dispute is weighed.

**Problem Statement**
> Online shopping fraud is the #1 scam type reported to Indonesia's Anti-Scam Centre (IASC, OJK): 53,928 reports between Nov 2024 and Oct 2025, out of ~299,000 scam reports totalling Rp7 trillion in losses. Many person-to-person trades happen outside marketplaces — in Facebook groups, Instagram, WhatsApp and gaming communities — where there is no escrow. People rely on "rekber" (rekening bersama): a middleman who holds the money until the item arrives. But fake rekber is itself a documented scam, licensed rekber services still hold your money, and disputes are decided manually by an admin. Even inside marketplaces, the infamous "ordered a phone, received a brick" cases end with the shop and the courier blaming each other — because nobody collected evidence of who cheated.

**Solution**
> Rekber AI replaces the human middleman. The buyer's payment is locked in a BNB Chain smart contract that nobody — including us — can withdraw from. The seller must photograph the actual item next to a unique deal code before shipping. If the buyer is satisfied (or stays silent until the window closes), funds release to the seller. If not, an AI arbiter agent compares the seller's promised spec, the packing photo and the buyer's unboxing photo, then autonomously refunds or releases on-chain — or escalates to a human when unsure. Every verdict is committed on-chain as a hash of its reasoning. Users need no wallet setup and pay no gas.

**Project Detail (markdown, supports Mermaid)**
> Paste the full contents of [`README.md`](../../README.md) — it already has the one-sentence pitch, problem, solution, live testnet addresses, architecture diagrams (state machine + trust flow), trust model table, "why blockchain / why AI", how to run, tests, env vars, and honest known limitations. Don't duplicate it here by hand; copy the file verbatim so it can't drift out of sync.

**GitHub Repo (public)**
> ⬜ TODO — repo stays private until the secret scan in R-15 passes (`git log -p --all | grep -nE 'PRIVATE_KEY=0x|AIMLAPI_API_KEY=[0-9a-f]|sk-'` must be empty).

**Website Project**
> ⬜ TODO — the public tunnel URL from R-13 (e.g. `https://<name>.trycloudflare.com`), once web+agent are running against BSC Testnet and exposed publicly.

**Video Demo**
> ⬜ TODO — R-15. Script outline lives in [`DECK.md`](DECK.md).

**X / Twitter, LinkedIn**
> Optional — team's own accounts, not drafted here.

**Pitch Deck — Canva/Drive**
> ⬜ TODO — 10-slide deck is built (Claude artifact "Rekber AI Pitch Deck", content from [`DECK.md`](DECK.md)). Export it to PPTX/PDF, upload to Google Drive or import into Canva, set sharing to "anyone with the link", paste that link here. The artifact link itself is private until shared.

---

## What's actually left before this form can be submitted

1. R-12 — calibrate the AI judge on real photos (currently only tested against mock evidence)
2. R-13 — fund `aiArbiter`/`relayer` wallets with tBNB, run web+agent live against BSC Testnet, expose publicly, test with 2 real phones → gives the **Website Project** link + real per-status testnet transactions for the README table
3. R-14 — done (this file + `README.md`)
4. R-15 — logo ✅ and deck ✅ done; still: record video, export deck + share link, publish the repo (after secret scan), submit this form
