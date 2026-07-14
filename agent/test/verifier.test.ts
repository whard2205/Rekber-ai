import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseModelVerdict,
  MockModelVerifier,
  ProofRegistry,
  evaluateProof,
} from "../src/verifier.js";
import type { HumanTaskSpec, ProofImage } from "../src/types.js";

const spec: HumanTaskSpec = {
  title: "Foto jempol",
  instructions: "Ambil foto jempol dengan kode tantangan terlihat.",
  acceptanceCriteria: ["Terlihat jempol manusia", "Kode tantangan terlihat di foto"],
  bountyIDRX: 500000,
  challenge: "MDR-TEST01",
};

const proofWith = (text: string): ProofImage => ({
  base64: Buffer.from(text).toString("base64"),
  mediaType: "image/jpeg",
});

function tempRegistry(): ProofRegistry {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mandor-reg-")), "registry.json");
  return new ProofRegistry(file);
}

const baseInput = {
  taskId: "0",
  spec,
  proofHash: "0xaaa1" as `0x${string}`,
  submittedAt: 1000,
  deadline: 2000,
};

const opts = () => ({
  model: new MockModelVerifier(),
  registry: tempRegistry(),
  confidenceThreshold: 0.8,
});

// --- parseModelVerdict: schema validation sebelum aksi finansial ---

test("parseModelVerdict menerima verdict valid", () => {
  const v = parseModelVerdict({
    challengeMatched: true,
    requirementsMatched: true,
    confidence: 0.9,
    decision: "APPROVE",
    reasons: ["ok"],
  });
  assert.equal(v.decision, "APPROVE");
});

test("parseModelVerdict menolak non-objek", () => {
  assert.throws(() => parseModelVerdict("bukan objek"));
  assert.throws(() => parseModelVerdict(null));
});

test("parseModelVerdict menolak decision di luar enum", () => {
  assert.throws(() =>
    parseModelVerdict({
      challengeMatched: true,
      requirementsMatched: true,
      confidence: 0.9,
      decision: "MAYBE",
      reasons: [],
    }),
  );
});

test("parseModelVerdict menolak confidence di luar 0..1", () => {
  assert.throws(() =>
    parseModelVerdict({
      challengeMatched: true,
      requirementsMatched: true,
      confidence: 1.2,
      decision: "APPROVE",
      reasons: [],
    }),
  );
});

test("parseModelVerdict menolak reasons yang bukan array string", () => {
  assert.throws(() =>
    parseModelVerdict({
      challengeMatched: true,
      requirementsMatched: true,
      confidence: 0.9,
      decision: "APPROVE",
      reasons: "ok",
    }),
  );
});

// --- MockModelVerifier: aturan deterministik untuk uji offline ---

test("mock: challenge ada di bukti -> approve", async () => {
  const raw = await new MockModelVerifier().evaluate(spec, proofWith("foto jempol MDR-TEST01"));
  const v = parseModelVerdict(raw);
  assert.equal(v.challengeMatched, true);
  assert.equal(v.decision, "APPROVE");
});

test("mock: challenge tidak ada -> reject", async () => {
  const raw = await new MockModelVerifier().evaluate(spec, proofWith("foto lama tanpa kode"));
  const v = parseModelVerdict(raw);
  assert.equal(v.challengeMatched, false);
  assert.equal(v.decision, "REJECT");
});

// --- evaluateProof: pipeline berlapis + gating fail-safe ---

test("pipeline: happy path -> APPROVE", async () => {
  const verdict = await evaluateProof({ ...baseInput, proof: proofWith("jempol MDR-TEST01") }, opts());
  assert.equal(verdict.decision, "APPROVE");
  assert.equal(verdict.duplicateDetected, false);
  assert.equal(verdict.evidenceHash, baseInput.proofHash);
});

test("pipeline: bukti hilang -> REJECT", async () => {
  const verdict = await evaluateProof({ ...baseInput, proof: null }, opts());
  assert.equal(verdict.decision, "REJECT");
});

test("pipeline: submit melewati deadline -> REJECT", async () => {
  const verdict = await evaluateProof(
    { ...baseInput, proof: proofWith("jempol MDR-TEST01"), submittedAt: 3000 },
    opts(),
  );
  assert.equal(verdict.decision, "REJECT");
});

test("pipeline: hash sama dipakai task berbeda -> duplicateDetected + REJECT", async () => {
  const shared = opts();
  const first = await evaluateProof({ ...baseInput, proof: proofWith("jempol MDR-TEST01") }, shared);
  assert.equal(first.decision, "APPROVE");
  const second = await evaluateProof(
    { ...baseInput, taskId: "1", proof: proofWith("jempol MDR-TEST01") },
    shared,
  );
  assert.equal(second.duplicateDetected, true);
  assert.equal(second.decision, "REJECT");
});

test("pipeline: task sama re-evaluasi hash sama -> bukan duplikat", async () => {
  const shared = opts();
  await evaluateProof({ ...baseInput, proof: proofWith("jempol MDR-TEST01") }, shared);
  const again = await evaluateProof({ ...baseInput, proof: proofWith("jempol MDR-TEST01") }, shared);
  assert.equal(again.duplicateDetected, false);
});

test("pipeline: confidence di bawah ambang -> REJECT walau model approve", async () => {
  const optimis = {
    name: "optimis",
    evaluate: async () => ({
      challengeMatched: true,
      requirementsMatched: true,
      confidence: 0.5,
      decision: "APPROVE",
      reasons: ["yakin setengah"],
    }),
  };
  const verdict = await evaluateProof(
    { ...baseInput, proof: proofWith("apa saja") },
    { ...opts(), model: optimis },
  );
  assert.equal(verdict.decision, "REJECT");
});

test("pipeline: output model malformed -> REJECT fail-safe (bukan crash, bukan bayar)", async () => {
  const rusak = { name: "rusak", evaluate: async () => ({ nonsense: true }) };
  const verdict = await evaluateProof(
    { ...baseInput, proof: proofWith("apa saja") },
    { ...opts(), model: rusak },
  );
  assert.equal(verdict.decision, "REJECT");
});

test("pipeline: registry persist ke file dan terbaca ulang", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mandor-reg-")), "registry.json");
  const reg1 = new ProofRegistry(file);
  reg1.checkAndRecord("0xbeef" as `0x${string}`, "7");
  const reg2 = new ProofRegistry(file);
  assert.equal(reg2.checkAndRecord("0xbeef" as `0x${string}`, "8"), true); // task lain -> duplikat
});
