import assert from "node:assert/strict";
import { test } from "node:test";
import { checkShipment } from "../src/shipment.js";
import type { AiProvider } from "../src/ai.js";
import type { DealRecord, ImageInput } from "../src/types.js";

function baseDeal(): DealRecord {
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
      checklist: ["128GB", "Hitam"],
      listingPhotos: ["listing.jpg"],
    },
    specHash: `0x${"aa".repeat(32)}`,
    offer: { deadline: 0, sig: "0x" },
    txs: {},
  };
}

function img(label: string, text: string): ImageInput {
  return { label, base64: Buffer.from(text, "utf8").toString("base64"), mediaType: "image/jpeg" };
}

test("mock: foto packing mengandung BARANG -> itemVisible true, tanpa warning", async () => {
  const c = await checkShipment(baseDeal(), [img("Foto 1 — packing dari penjual", "terlihat BARANG dan kode")], null);
  assert.equal(c.itemVisible, true);
  assert.equal(c.warnings.length, 0);
  assert.equal(c.model, "mock");
});

test("mock: foto packing TANPA penanda BARANG -> itemVisible false, ada warning", async () => {
  const c = await checkShipment(baseDeal(), [img("Foto 1 — packing dari penjual", "cuma dus tertutup")], null);
  assert.equal(c.itemVisible, false);
  assert.ok(c.warnings.length > 0);
});

test("provider: output valid diteruskan apa adanya + model/checkedAt ditambahkan", async () => {
  const provider: AiProvider = {
    name: "fake:v1",
    async evaluate() {
      return {
        dealCodeVisible: true,
        itemVisible: true,
        itemMatchesListing: true,
        resiReadable: true,
        courier: "JNE",
        resiNumber: "JX123",
        warnings: [],
      };
    },
  };
  const c = await checkShipment(baseDeal(), [img("x", "x")], provider);
  assert.equal(c.courier, "JNE");
  assert.equal(c.model, "fake:v1");
  assert.ok(c.checkedAt);
});

test("output provider malformed -> fail-safe (warning generik, bukan crash)", async () => {
  const provider: AiProvider = {
    name: "fake:v1",
    async evaluate() {
      return { itemVisible: "ya" }; // rusak — harus boolean
    },
  };
  const c = await checkShipment(baseDeal(), [img("x", "x")], provider);
  assert.equal(c.itemVisible, false);
  assert.ok(c.warnings.length > 0);
});
