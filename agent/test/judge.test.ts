import assert from "node:assert/strict";
import { test } from "node:test";
import os from "node:os";
import path from "node:path";
import { keccak256, toHex } from "viem";
import { judgeDispute, buildEscalateVerdict, applyRules } from "../src/judge.js";
import { PhotoRegistry } from "../src/registry.js";
import type { AiProvider } from "../src/ai.js";
import type { DealRecord, ImageInput } from "../src/types.js";

function tmpRegistry(): PhotoRegistry {
  const file = path.join(os.tmpdir(), `photo-registry-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  return new PhotoRegistry(file);
}

function baseDeal(overrides: Partial<DealRecord> = {}): DealRecord {
  return {
    dealCode: "RKB-TEST01",
    dealId: `0x${"11".repeat(32)}`,
    createdAt: new Date().toISOString(),
    seller: "0xseller",
    spec: {
      dealCode: "RKB-TEST01",
      seller: "0xseller",
      title: "iPhone 13",
      priceIDRX: "8500000",
      description: "iPhone 13 128GB hitam mulus",
      checklist: ["128GB", "Hitam", "Tidak retak"],
      listingPhotos: ["listing.jpg"],
    },
    specHash: `0x${"aa".repeat(32)}`,
    offer: { deadline: 0, sig: "0x" },
    shipment: {
      packingPhotos: ["packing.jpg"],
      resiPhoto: null,
      resiText: "JNE 123",
      shipmentHash: `0x${"bb".repeat(32)}`,
      submittedAt: new Date().toISOString(),
    },
    dispute: {
      photos: ["unboxing.jpg"],
      complaint: "Barang tidak sesuai",
      disputeHash: `0x${"cc".repeat(32)}`,
      submittedAt: new Date().toISOString(),
    },
    txs: {},
    ...overrides,
  };
}

function img(label: string, text: string): ImageInput {
  return { label, base64: Buffer.from(text, "utf8").toString("base64"), mediaType: "image/jpeg" };
}

test("mock: bukti pembeli mengandung BATU -> REFUND confidence 0.95", async () => {
  const deal = baseDeal();
  const images = [img("Foto 1 — unboxing dari pembeli", "foto batu bata BATU")];
  const v = await judgeDispute(deal, images, {
    provider: null,
    confidenceThreshold: 0.85,
    registry: tmpRegistry(),
    buyerPhotoFilenames: ["unboxing.jpg"],
  });
  assert.equal(v.outcome, "REFUND");
  assert.equal(v.confidence, 0.95);
});

test("mock: bukti pembeli mengandung SESUAI -> RELEASE confidence 0.95", async () => {
  const deal = baseDeal();
  const images = [img("Foto 1 — unboxing dari pembeli", "barang SESUAI deskripsi")];
  const v = await judgeDispute(deal, images, {
    provider: null,
    confidenceThreshold: 0.85,
    registry: tmpRegistry(),
    buyerPhotoFilenames: ["unboxing.jpg"],
  });
  assert.equal(v.outcome, "RELEASE");
  assert.equal(v.confidence, 0.95);
});

test("mock: tanpa penanda jelas -> UNSURE (0.4) -> gate ESCALATE", async () => {
  const deal = baseDeal();
  const images = [img("Foto 1 — unboxing dari pembeli", "foto biasa saja")];
  const v = await judgeDispute(deal, images, {
    provider: null,
    confidenceThreshold: 0.85,
    registry: tmpRegistry(),
    buyerPhotoFilenames: ["unboxing.jpg"],
  });
  assert.equal(v.outcome, "ESCALATE");
});

test("foto unboxing duplikat lintas-deal -> ESCALATE tanpa panggil AI", async () => {
  const registry = tmpRegistry();
  const images = [img("Foto 1 — unboxing dari pembeli", "SESUAI")];
  await judgeDispute(baseDeal({ dealCode: "RKB-A" }), images, {
    provider: null,
    confidenceThreshold: 0.85,
    registry,
    buyerPhotoFilenames: ["shared.jpg"],
  });
  const v = await judgeDispute(baseDeal({ dealCode: "RKB-B" }), images, {
    provider: null,
    confidenceThreshold: 0.85,
    registry,
    buyerPhotoFilenames: ["shared.jpg"],
  });
  assert.equal(v.outcome, "ESCALATE");
  assert.match(v.reasons.join(" "), /daur ulang/);
});

test("re-evaluasi deal YANG SAMA dengan foto yang sama bukan dianggap duplikat", async () => {
  const registry = tmpRegistry();
  const deal = baseDeal();
  const images = [img("Foto 1 — unboxing dari pembeli", "SESUAI")];
  const v1 = await judgeDispute(deal, images, { provider: null, confidenceThreshold: 0.85, registry, buyerPhotoFilenames: ["unboxing.jpg"] });
  const v2 = await judgeDispute(deal, images, { provider: null, confidenceThreshold: 0.85, registry, buyerPhotoFilenames: ["unboxing.jpg"] });
  assert.equal(v1.outcome, "RELEASE");
  assert.equal(v2.outcome, "RELEASE");
});

test("provider: decision REFUND confidence tinggi -> lolos gate", async () => {
  const deal = baseDeal();
  const provider: AiProvider = {
    name: "fake:v1",
    async evaluate() {
      return {
        itemMatchesListing: false,
        dealCodeInSellerPhoto: true,
        dealCodeInBuyerPhoto: true,
        problems: ["Barang tidak sesuai"],
        sellerEvidence: "LEMAH",
        buyerEvidence: "KUAT",
        confidence: 0.93,
        reasons: ["Barang di foto unboxing tidak sesuai deskripsi"],
      };
    },
  };
  const v = await judgeDispute(deal, [img("x", "x")], {
    provider,
    confidenceThreshold: 0.85,
    registry: tmpRegistry(),
    buyerPhotoFilenames: ["unboxing.jpg"],
  });
  assert.equal(v.outcome, "REFUND");
  assert.equal(v.confidence, 0.93);
});

test("provider: confidence di bawah ambang -> ESCALATE walau decision tegas", async () => {
  const deal = baseDeal();
  const provider: AiProvider = {
    name: "fake:v1",
    async evaluate() {
      return {
        itemMatchesListing: true,
        dealCodeInSellerPhoto: true,
        dealCodeInBuyerPhoto: true,
        problems: [],
        sellerEvidence: "KUAT",
        buyerEvidence: "LEMAH",
        confidence: 0.5,
        reasons: ["Tampak sesuai tapi kurang yakin"],
      };
    },
  };
  const v = await judgeDispute(deal, [img("x", "x")], {
    provider,
    confidenceThreshold: 0.85,
    registry: tmpRegistry(),
    buyerPhotoFilenames: ["unboxing.jpg"],
  });
  assert.equal(v.outcome, "ESCALATE");
});

test("provider: bukti dua pihak sama-sama KUAT -> ESCALATE (aturan 6)", async () => {
  const deal = baseDeal();
  const provider: AiProvider = {
    name: "fake:v1",
    async evaluate() {
      return {
        itemMatchesListing: false,
        dealCodeInSellerPhoto: true,
        dealCodeInBuyerPhoto: true,
        problems: [],
        sellerEvidence: "KUAT",
        buyerEvidence: "KUAT",
        confidence: 0.95,
        reasons: ["Kemungkinan tertukar kurir"],
      };
    },
  };
  const v = await judgeDispute(deal, [img("x", "x")], {
    provider,
    confidenceThreshold: 0.85,
    registry: tmpRegistry(),
    buyerPhotoFilenames: ["unboxing.jpg"],
  });
  assert.equal(v.outcome, "ESCALATE");
});

test("output provider malformed -> ESCALATE fail-safe, bukan crash", async () => {
  const deal = baseDeal();
  const provider: AiProvider = {
    name: "fake:v1",
    async evaluate() {
      return { decision: "MAYBE", confidence: 2 };
    },
  };
  const v = await judgeDispute(deal, [img("x", "x")], {
    provider,
    confidenceThreshold: 0.85,
    registry: tmpRegistry(),
    buyerPhotoFilenames: ["unboxing.jpg"],
  });
  assert.equal(v.outcome, "ESCALATE");
  assert.match(v.reasons.join(" "), /tidak valid/);
});

test("error jaringan dari provider dilempar ke atas (bukan ditelan jadi ESCALATE)", async () => {
  const deal = baseDeal();
  const provider: AiProvider = {
    name: "fake:v1",
    async evaluate() {
      throw new Error("network down");
    },
  };
  await assert.rejects(
    judgeDispute(deal, [img("x", "x")], {
      provider,
      confidenceThreshold: 0.85,
      registry: tmpRegistry(),
      buyerPhotoFilenames: ["unboxing.jpg"],
    }),
    /network down/,
  );
});

test("verdictHash deterministik dan cocok dengan hitungan ulang dari commit tersimpan", async () => {
  const deal = baseDeal();
  const images = [img("Foto 1 — unboxing dari pembeli", "SESUAI")];
  const v1 = await judgeDispute(deal, images, {
    provider: null,
    confidenceThreshold: 0.85,
    registry: tmpRegistry(),
    buyerPhotoFilenames: ["unboxing-a.jpg"],
  });
  // Catatan: tidak membandingkan verdictHash dari dua panggilan judgeDispute terpisah —
  // commit.decidedAt (jam sungguhan) berbeda antar panggilan, jadi hash-nya MEMANG beda.
  // Itu bukan bug: tiap putusan nyata memang terjadi di detik yang unik. Yang benar-benar
  // harus deterministik (dan yang benar-benar dipakai siapa pun untuk verifikasi) adalah:
  // hash dari SATU commit yang sama selalu sama kalau dihitung ulang.

  // Siapa pun (pembeli/penjual/juri) bisa menghitung ulang hash dari commit yang tersimpan
  // di verdict file dan mencocokkannya ke event on-chain — ini yang mereka lakukan.
  const recomputed = keccak256(toHex(JSON.stringify(v1.commit)));
  assert.equal(recomputed, v1.verdictHash);
});

test("buildEscalateVerdict: commit outcome ESCALATE, dealCode sesuai", () => {
  const deal = baseDeal();
  const v = buildEscalateVerdict(deal, "mock", ["alasan uji"]);
  assert.equal(v.outcome, "ESCALATE");
  assert.equal(v.commit.outcome, "ESCALATE");
  assert.equal(v.commit.dealCode, deal.dealCode);
  assert.equal(v.commit.dealId, deal.dealId);
});

test("applyRules: tabel aturan 4–6 diterapkan kode, bukan model", () => {
  assert.equal(applyRules("KUAT", "LEMAH"), "RELEASE");
  assert.equal(applyRules("LEMAH", "KUAT"), "REFUND");
  assert.equal(applyRules("KUAT", "KUAT"), "UNSURE");
  assert.equal(applyRules("LEMAH", "LEMAH"), "UNSURE");
});
