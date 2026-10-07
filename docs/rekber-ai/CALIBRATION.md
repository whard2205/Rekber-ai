# R-12 — AI judge calibration on real photos

Date: 7 Oct 2026 · Model: `gpt-4o` via AI/ML API (`AI_PROVIDER=aimlapi`) · Confidence threshold: 0.85
Code path: the same `judgeDispute()` the agent daemon runs in production (`agent/src/judge.ts`), with the same image labels as `agent/src/loop.ts`.

## Evidence used

Four phone photos, each with the deal code **RKB-CEK7AB** handwritten on paper next to the item. The photos are not committed to the repo.

| Photo | Shows | Plays the role of |
|---|---|---|
| A | Black Android phone in a brown case, next to the code | Seller's listing photo, and an honest packing photo |
| B | Closed yellow box next to the code | A weak packing photo (item not visible) |
| C | Same box opened: a lotion bottle inside, code visible | Buyer receives the wrong item |
| D | Same box opened: the phone from photo A, code visible | Buyer receives the right item |

Listing for every case: *"HP Android hitam bekas — layar mulus tanpa retak atau lecet, termasuk case kulit cokelat"*, Rp2.500.000.

## Cases and expected outcome (public rules 1–7, BLUEPRINT §2)

| # | Packing | Unboxing | Buyer's complaint | Expected |
|---|---|---|---|---|
| 1 | B (closed box) | C (lotion) | "Yang datang botol lotion, bukan HP" | **REFUND** — rule 5: buyer's evidence strong, seller never showed the item |
| 2 | A (phone) | D (same phone, intact) | "Layar HP-nya lecet parah" — false | **RELEASE** — rule 4: seller strong, the claimed scratch isn't in the buyer's photo |
| 3 | A (phone) | C (lotion) | "Yang datang botol lotion, bukan HP" | **ESCALATE** — rule 6: both sides strong and contradictory (likely swapped in transit) |

## Results

| Round | Prompt version | Case 1 | Case 2 | Case 3 |
|---|---|---|---|---|
| 1 | v0 (rules only) | ✅ REFUND 1.00 · 7.1 s | ❌ REFUND 0.90 · 4.7 s | ❌ REFUND 0.90 · 5.7 s |
| 2 | v1 (+ decision procedure) | ❌ ESCALATE 0.90 · 5.1 s | ✅ RELEASE 0.95 · 4.4 s | ✅ ESCALATE 0.90 · 5.8 s |
| 3–5 | v1 + "listing isn't shipment proof" | ❌ ESCALATE ×3 | ✅ RELEASE ×3 | ✅ ESCALATE ×3 |
| 6–8 | v2 (code applies the rules) | ✅ REFUND ×3 | ⚠️ ESCALATE ×3 | ✅ ESCALATE ×3 |
| **9** | **v3** | ✅ REFUND 0.95 · 6.1 s | ✅ RELEASE 0.95 · 4.1 s | ✅ ESCALATE 0.90 · 4.0 s |
| **10** | **v3** | ✅ REFUND 0.95 · 5.3 s | ✅ RELEASE 0.90 · 3.9 s | ✅ ESCALATE 1.00 · 4.6 s |
| **11** | **v3** | ✅ REFUND 0.90 · 5.7 s | ✅ RELEASE 0.90 · 5.6 s | ✅ ESCALATE 0.90 · 4.7 s |

**Final (v3): 9/9 correct across 3 consecutive rounds. Decision time 3.9–6.1 s** (target < 15 s).

## What we learned and changed

1. **v0 → v1. The model believed the buyer's text over the photos.** In case 2 it wrote "layar HP lecet" in a public reason although the photo shows an intact screen. In case 3 it refunded a likely courier swap, and treated "seller didn't respond" as evidence against the seller. Fix: an explicit procedure in the prompt. Judge the seller only from the packing photo and the buyer only from the unboxing photo. A complaint is a claim, not evidence. Silence is not evidence. Never write anything that isn't visible.
2. **v1 → v2. Right perception, wrong rule application.** In case 1 the model correctly wrote "penjual hanya menunjukkan dus tertutup" and "pembeli menerima botol lotion", then still chose UNSURE. Fix: **the model no longer decides.** It only rates each side's evidence `KUAT`/`LEMAH` (`sellerEvidence`, `buyerEvidence`), and `applyRules()` in code turns that into REFUND / RELEASE / ESCALATE using public rules 4–6. This is the same principle as the confidence gate: the model never gets the last word alone.
3. **v2 → v3. Suggestion from the complaint text.** In case 2 the model rated the buyer's evidence `KUAT` while also saying the item matches the listing (`itemMatchesListing: true`). That's a contradiction caused by the "lecet" complaint and glare on a black screen. The safe failure was ESCALATE, never a wrong payout. Fix: the buyer's evidence may only be `KUAT` when the item does *not* match the listing; glare isn't a scratch; and the complaint is labelled as an unverified claim in the prompt.

Throughout, every wrong answer after v0 failed toward **ESCALATE** (a human decides), never toward paying the wrong party.

## Limits

- Three scenarios and one product category, four photos. This is a calibration, not an accuracy benchmark.
- `confidence` is the model's self-reported score, not a measured accuracy.
- Photos can't prove internal condition (battery, function), only what's visible.
