# Rekber AI — pitch deck outline (10 slides) + video script

Build the actual deck in Canva/Slides from this outline — this file is content, not a design.
Source for every fact: `docs/rekber-ai/BLUEPRINT.md` §14. Don't add claims that aren't in there.

## Deck outline

**1. Title**
- Rekber AI
- *Rekber without an admin — funds held by a smart contract, disputes settled by AI.*
- Team Gedung Hijau · Indonesia Web3 Hackathon 2026 · AI Agents / Finance & Commerce

**2. The hook**
- "Who here has bought something from a Facebook group or IG shop and felt that knot in your stomach wondering if the money's gone?"
- Big stat: online shopping fraud = **scam type #1 in Indonesia** (IASC/OJK, 53,928 reports Nov 2024–Oct 2025, Rp7T lost)
- Screenshot of a real "ordered a phone, got a brick" news headline (Liputan6, Oct 2021)

**3. The problem, one layer deeper**
- Outside marketplaces (FB groups, IG, WA, game-account trades): **no escrow at all**
- People turn to "rekber" (rekening bersama) — but:
  - fake rekber is itself a documented scam pattern (Polda Bali, game-account trades)
  - real rekber services (e.g. RekberPay) still **hold your money** and an admin decides disputes
- Even inside marketplaces with escrow, the brick case ended "shop vs. courier blaming each other" — **nobody collected evidence of who cheated**

**4. Solution — one sentence**
- *Rekber AI replaces the admin with a smart contract that holds the money and an AI agent that judges the evidence.*
- Two guarantees on screen: **"We cannot take your money"** / **"The AI explains every decision, on-chain"**

**5. How it works (6 steps)**
1. Seller lists item, AI turns the description into an objective spec checklist, seller signs the offer
2. Buyer pays — funds lock in the contract, no gas, no wallet setup
3. Seller photographs the real item next to a unique deal code before shipping
4. Buyer confirms → funds release (or auto-releases if buyer stays silent)
5. Buyer disputes instead → uploads unboxing photo + deal code + complaint
6. AI arbiter compares seller's promise vs. packing photo vs. unboxing photo → REFUND / RELEASE, or escalates to a human if unsure. Verdict + reasoning committed on-chain.
- Use the flowchart from `README.md` (architecture diagram) as the slide visual

**6. Why blockchain, why AI (the judges will ask this anyway)**
- Blockchain: the actual problem is *someone who can run off with the money* — here, nobody can, not even us. Every verdict is checkable on BscScan.
- AI: judging photo evidence used to need a human admin on call 24/7. The agent decides in seconds with a written reason, and *executes the on-chain settlement itself*.
- One line: "Take away the blockchain, you're back to trusting an admin. Take away the AI, you're back to a slow, expensive human."

**7. Competitive positioning**
- **RekberPay** (closest real-world competitor): custodial, admin decides. We're non-custodial, AI decides in seconds, every verdict public.
- **MileAI** (hackathon): judges freelance deliverables from one side's evidence. We arbitrate a two-sided dispute from photo evidence, for physical goods.
- **GenLayer Internet Court** (global, Jul 2026, OKX/MetaMask-backed consortium): validates "AI as arbiter" as a real category — but targets digital-service disputes between AI agents. We target physical goods between ordinary Indonesian people, with a photo-evidence protocol.
- Honest originality line: *"AI-arbitrated escrow is starting to exist globally. What doesn't exist yet: an evidence protocol for physical goods — the seller must photograph the item with the deal code before shipping, the buyer must photograph unboxing with the same code — so the AI can tell who's lying, not just 'does it match.'"*

**8. Business model**
- 1% fee, **only when a trade settles successfully to the seller** — refunds are free, so we only profit when the trade was honest
- Sits at the low end of typical independent rekber fees (~1–5%), runs 24/7 with no admin
- Later: "Pay via Rekber AI" widget/API for small online shops and FB/IG selling groups

**9. Regulatory honesty (say this out loud, don't dodge it)**
- Crypto isn't legal tender in Indonesia; MVP uses Mock IDRX on testnet. Production path: real IDRX + licensed on/off-ramp + a licensed payment-service partner (PJP) or OJK sandbox.
- Running a rekber is itself a regulated activity under Indonesian law (UU No. 3/2011) — our argument is that a non-custodial contract never holds funds the way a traditional rekber does, but there's no legal ruling on this yet, and we say so plainly.
- AI never auto-decides on low confidence — it escalates to a human instead of guessing with someone's money.

**10. Live on testnet + close**
- Verified contract address + BscScan link (from README) on screen
- Test counts: 61 contract tests, 16 agent tests, 5-scenario end-to-end smoke test — this isn't just a UI mockup
- Close: *"We can't run off with your money — even if we wanted to. Rekber AI."*

---

## Video script (≤5 minutes, from BLUEPRINT §10 demo script)

Use the 3-minute Demo Day script in `docs/rekber-ai/BLUEPRINT.md` §10 as the spine, plus ~30–60s upfront on architecture/trust model (slide 5/6 content) since a recorded video has more room than a live 3-minute stage slot. Beats:

| Time | Beat |
|---|---|
| 0:00–0:20 | Hook: the "deg-degan" feeling + the #1-scam-type stat + the brick headline |
| 0:20–0:45 | Problem: no escrow outside marketplaces; fake rekber; real rekber still custodial; brick case = no evidence protocol |
| 0:45–1:00 | Solution, one sentence |
| 1:00–1:30 | **Live:** create a listing ("selling iPhone 13"), AI writes the spec, buyer scans QR, pays with no gas — stage screen shows funds locked + BscScan link |
| 1:30–1:50 | Seller uploads a packing photo of a **sealed box only** — AI immediately flags it ⚠️ to the buyer |
| 1:50–2:25 | Unbox reveals a **brick** (demo prop) — buyer disputes with photo + code, seller responds, AI weighs it → **REFUND**, reasoning shown, verdictHash on BscScan |
| 2:25–2:45 | Second case (if time allows): buyer falsely claims damage on a photo showing a mint-condition phone → **RELEASE**. Line: "The AI doesn't favor the buyer — it favors the evidence." |
| 2:45–3:15 | 30–60s on architecture: show the trust-model table, say plainly what the relayer/arbiter can and can't do |
| 3:15–3:30 | Close: "We can't run off with your money — even if we wanted to. Rekber AI." |

Backup plan (keep for the actual recording): have a second deal already sitting at "Shipped" so you can jump straight to the dispute scene if the live flow hiccups; record a full clean run beforehand as a fallback cut.
