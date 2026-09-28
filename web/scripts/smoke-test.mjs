/**
 * Smoke test end-to-end (docs/rekber-ai/PLAN.md R-11) — HTTP nyata ke API routes yang
 * jalan (pola MANDOR, lihat git 8a06e0a worker-app/scripts/smoke-test.mjs), plus baca
 * kontrak langsung buat cross-check verdictHash melawan event on-chain. Mensimulasikan
 * yang dilakukan browser: publish -> bayar (permit+Fund) -> kirim -> konfirmasi/komplain
 * -> (agent AI memutus) -> tanggapan/putusan.
 *
 * Prasyarat (semua di localhost/hardhat, TIDAK PERNAH testnet/mainnet — lihat guard
 * chainId di bawah): hardhat node + deploy + export-abi sudah jalan, agent daemon mode
 * mock sedang jalan (`npm start` di agent/), web dev server sedang jalan di BASE_URL.
 *
 * Pakai: node scripts/smoke-test.mjs   (dari web/)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createPublicClient, createWalletClient, createTestClient, http, keccak256, toHex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { hardhat } from "viem/chains";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const BASE = process.env.BASE_URL || "http://127.0.0.1:3001";
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

const deployment = JSON.parse(fs.readFileSync(path.join(root, "contracts", "deployments", "localhost.json"), "utf8"));
if (deployment.chainId !== 31337) {
  throw new Error(`Smoke test cuma boleh jalan di localhost (chainId 31337) — deployment ini chainId ${deployment.chainId}. ` +
    "Kunci akun hardhat di bawah publik/well-known, jangan pernah dipakai di chain sungguhan.");
}
const escrowAbi = JSON.parse(fs.readFileSync(path.join(root, "web", "src", "abi", "RekberEscrow.json"), "utf8"));

// Akun hardhat default (mnemonic publik "test test test ... junk") — hanya untuk localhost.
const HUMAN_ARBITER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // #0
const BYSTANDER_KEY = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"; // #5, panggil fungsi timeout permissionless

const publicClient = createPublicClient({ chain: hardhat, transport: http(RPC_URL) });
const testClient = createTestClient({ chain: hardhat, mode: "hardhat", transport: http(RPC_URL) });

const rekberDomain = { name: "RekberEscrow", version: "1", chainId: 31337, verifyingContract: deployment.escrow };
const permitDomain = { name: "Mock IDRX", version: "1", chainId: 31337, verifyingContract: deployment.token };
const OFFER_TYPES = { Offer: [
  { name: "dealId", type: "bytes32" }, { name: "seller", type: "address" }, { name: "amount", type: "uint256" },
  { name: "specHash", type: "bytes32" }, { name: "deadline", type: "uint256" },
] };
const FUND_TYPES = { Fund: [
  { name: "dealId", type: "bytes32" }, { name: "buyer", type: "address" }, { name: "seller", type: "address" },
  { name: "amount", type: "uint256" }, { name: "specHash", type: "bytes32" }, { name: "deadline", type: "uint256" },
] };
const ACT_TYPES = { Act: [
  { name: "dealId", type: "bytes32" }, { name: "action", type: "uint8" }, { name: "data", type: "bytes32" },
  { name: "deadline", type: "uint256" },
] };
const PERMIT_TYPES = { Permit: [
  { name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
] };
const Action = { Ship: 0, Confirm: 1, Dispute: 2 };
const Status = { None: 0, Funded: 1, Shipped: 2, Disputed: 3, Escalated: 4, Released: 5, Refunded: 6, Split: 7 };
const ZERO_HASH = `0x${"0".repeat(64)}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Deadline tanda tangan dihitung dari block.timestamp CHAIN, bukan Date.now() host — skenario
// 5 (evm_increaseTime) memajukan jam chain permanen untuk sisa umur node hardhat ini, jadi
// kalau smoke test dijalankan lagi melawan node yang sama, jam chain sudah lebih maju dari jam
// host dan tanda tangan berbasis Date.now() langsung tampak kedaluwarsa di mata kontrak.
async function deadline(offsetSeconds = 600) {
  // Hardhat cuma menempelkan timestamp waktu MENAMBANG blok baru — kalau chain nganggur
  // (tidak ada tx) sebentar, block terakhir yang dibaca getBlock() jadi BASI (lebih lambat
  // dari jam sungguhan) lalu MELOMPAT ke jam sungguhan begitu tx berikutnya ditambang,
  // gampang melewati deadline yang dihitung dari timestamp basi itu. Sebaliknya kalau
  // evm_increaseTime (skenario 5) memajukan chain, jam chain bisa lebih maju dari jam host.
  // Ambil yang PALING BESAR dari keduanya supaya aman di kedua arah drift.
  const [block, hostNow] = [await publicClient.getBlock(), BigInt(Math.floor(Date.now() / 1000))];
  const base = block.timestamp > hostNow ? block.timestamp : hostNow;
  return base + BigInt(offsetSeconds);
}

async function waitFor(fn, { timeoutMs = 30000, intervalMs = 1000, label }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(intervalMs);
  }
  throw new Error(`Timeout menunggu: ${label}`);
}

async function j(pathname, opts) {
  const res = await fetch(`${BASE}${pathname}`, opts);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${pathname} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

/** Foto bukti palsu: header JPEG valid + teks ASCII (mock hakim baca isi file sebagai teks
 * -- agent/src/judge.ts mockEvaluate). markerText null = foto biasa tanpa penanda. */
function fakeJpgBytes(markerText) {
  const header = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  const body = new TextEncoder().encode(markerText ?? `bukti-${Math.random()}`);
  return new Uint8Array([...header, ...body]);
}

async function uploadEvidence(bytes) {
  const expected = keccak256(bytes);
  const form = new FormData();
  form.append("files", new Blob([bytes], { type: "image/jpeg" }), "bukti.jpg");
  const { files } = await j("/api/evidence", { method: "POST", body: form });
  if (files[0] !== `${expected.slice(2)}.jpg`) throw new Error("Nama file bukti tidak cocok hash — upload rusak");
  return files[0];
}

async function publishDeal(sellerAcct, { title, price, markerText }) {
  const { dealCode, dealId } = await j("/api/deals/new", { method: "POST" });
  const listingPhoto = await uploadEvidence(fakeJpgBytes(`listing ${title}`));
  const spec = {
    dealCode,
    seller: sellerAcct.address,
    title,
    priceIDRX: String(price),
    description: `${title} — smoke test R-11`,
    checklist: ["Nyala normal", "Sesuai foto"],
    listingPhotos: [listingPhoto],
  };
  const specHash = keccak256(toHex(JSON.stringify(spec)));
  const offerDeadline = await deadline();
  const sig = await sellerAcct.signTypedData({
    domain: rekberDomain, types: OFFER_TYPES, primaryType: "Offer",
    message: { dealId, seller: sellerAcct.address, amount: BigInt(price), specHash, deadline: offerDeadline },
  });
  await j(`/api/deals/${dealCode}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dealId, spec, offer: { deadline: Number(offerDeadline), sig } }),
  });
  return { dealCode, dealId, specHash, markerText };
}

async function fundDeal(buyerAcct, sellerAddr, deal) {
  await j("/api/faucet", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: buyerAcct.address }),
  });
  const fundDeadline = await deadline();
  const fundSig = await buyerAcct.signTypedData({
    domain: rekberDomain, types: FUND_TYPES, primaryType: "Fund",
    message: { dealId: deal.dealId, buyer: buyerAcct.address, seller: sellerAddr, amount: 8_500_000n, specHash: deal.specHash, deadline: fundDeadline },
  });
  const { nonce } = await j(`/api/permit-nonce?owner=${buyerAcct.address}`);
  const permitDeadline = await deadline();
  const permitSig = await buyerAcct.signTypedData({
    domain: permitDomain, types: PERMIT_TYPES, primaryType: "Permit",
    message: { owner: buyerAcct.address, spender: deployment.escrow, value: 8_500_000n, nonce: BigInt(nonce), deadline: permitDeadline },
  });
  await j(`/api/deals/${deal.dealCode}/fund`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buyer: buyerAcct.address, fundDeadline: Number(fundDeadline), fundSig, permitDeadline: Number(permitDeadline), permitSig }),
  });
}

async function shipDeal(sellerAcct, deal) {
  const packingPhotos = [await uploadEvidence(fakeJpgBytes("packing rapi"))];
  const shipmentHash = keccak256(toHex(JSON.stringify({ packingPhotos, resiPhoto: null, resiText: "JNE 000111222" })));
  const shipDeadline = await deadline();
  const sig = await sellerAcct.signTypedData({
    domain: rekberDomain, types: ACT_TYPES, primaryType: "Act",
    message: { dealId: deal.dealId, action: Action.Ship, data: shipmentHash, deadline: shipDeadline },
  });
  await j(`/api/deals/${deal.dealCode}/ship`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packingPhotos, resiPhoto: null, resiText: "JNE 000111222", seller: sellerAcct.address, deadline: Number(shipDeadline), sig }),
  });
}

async function confirmDeal(buyerAcct, deal) {
  const confirmDeadline = await deadline();
  const sig = await buyerAcct.signTypedData({
    domain: rekberDomain, types: ACT_TYPES, primaryType: "Act",
    message: { dealId: deal.dealId, action: Action.Confirm, data: ZERO_HASH, deadline: confirmDeadline },
  });
  await j(`/api/deals/${deal.dealCode}/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buyer: buyerAcct.address, deadline: Number(confirmDeadline), sig }),
  });
}

async function disputeDeal(buyerAcct, deal) {
  // Konten HARUS unik tiap jalan (bukan cuma tiap deal) — PhotoRegistry (agent/src/registry.ts)
  // menganggap foto unboxing yang sama persis dipakai ulang di deal lain sebagai indikasi
  // penipuan dan langsung ESCALATE (fail-safe yang benar), jadi smoke test re-run harus
  // menghasilkan bytes baru setiap kali, bukan cuma marker+dealCode yang tetap sama isinya.
  const photos = [await uploadEvidence(fakeJpgBytes(`unboxing ${deal.markerText ?? ""} ${deal.dealCode} ${Date.now()}-${Math.random()}`))];
  const complaint = deal.markerText === "BATU" ? "Isi paket batu bata, bukan barang yang dijanjikan!" : "Cek dulu deh isinya, kok beda.";
  const disputeHash = keccak256(toHex(JSON.stringify({ photos, complaint })));
  const disputeDeadline = await deadline();
  const sig = await buyerAcct.signTypedData({
    domain: rekberDomain, types: ACT_TYPES, primaryType: "Act",
    message: { dealId: deal.dealId, action: Action.Dispute, data: disputeHash, deadline: disputeDeadline },
  });
  await j(`/api/deals/${deal.dealCode}/dispute`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photos, complaint, buyer: buyerAcct.address, deadline: Number(disputeDeadline), sig }),
  });
}

async function respondDeal(sellerAcct, deal, text) {
  const photos = [];
  const responseHash = keccak256(toHex(JSON.stringify({ photos, text })));
  const sig = await sellerAcct.signMessage({ message: { raw: responseHash } });
  await j(`/api/deals/${deal.dealCode}/respond`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photos, text, seller: sellerAcct.address, sig }),
  });
}

async function onchain(dealId) {
  return publicClient.readContract({ address: deployment.escrow, abi: escrowAbi, functionName: "getDeal", args: [dealId] });
}

async function eventVerdictHash(dealId, eventName) {
  const logs = await publicClient.getContractEvents({
    address: deployment.escrow, abi: escrowAbi, eventName, args: { dealId }, fromBlock: 0n,
  });
  if (logs.length === 0) throw new Error(`Tidak ada event ${eventName} untuk dealId ${dealId}`);
  return logs[logs.length - 1].args.verdictHash;
}

function runHumanResolve(dealCode, decision, reason) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "human-resolve", "--", dealCode, decision, reason], {
      cwd: path.join(root, "agent"),
      env: { ...process.env, HUMAN_ARBITER_PRIVATE_KEY: HUMAN_ARBITER_KEY },
      stdio: "pipe",
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`human-resolve.ts keluar dengan kode ${code}:\n${out}`))));
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`GAGAL: ${msg}`);
}

async function scenarioReleaseByConfirm() {
  console.log("\n1) RELEASE via konfirmasi langsung pembeli");
  const seller = privateKeyToAccount(generatePrivateKey());
  const buyer = privateKeyToAccount(generatePrivateKey());
  const deal = await publishDeal(seller, { title: "iPhone 13 — konfirmasi langsung", price: 8_500_000 });
  await fundDeal(buyer, seller.address, deal);
  await shipDeal(seller, deal);
  await confirmDeal(buyer, deal);
  const d = await onchain(deal.dealId);
  assert(d.status === Status.Released, `status harus Released, dapat ${d.status}`);
  assert(d.verdictHash === ZERO_HASH, "konfirmasi langsung harusnya verdictHash 0x0 (tanpa AI)");
  const evHash = await eventVerdictHash(deal.dealId, "Released");
  assert(evHash === d.verdictHash, "verdictHash event Released harus sama dengan getDeal()");
  console.log("   ✅ lulus —", deal.dealCode);
}

async function scenarioRefundByAi() {
  console.log("\n2) REFUND via hakim AI (bukti BATU)");
  const seller = privateKeyToAccount(generatePrivateKey());
  const buyer = privateKeyToAccount(generatePrivateKey());
  const deal = await publishDeal(seller, { title: "iPhone 13 — dapat batu", price: 8_500_000, markerText: "BATU" });
  await fundDeal(buyer, seller.address, deal);
  await shipDeal(seller, deal);
  await disputeDeal(buyer, deal);
  const d = await waitFor(async () => {
    const cur = await onchain(deal.dealId);
    return cur.status === Status.Refunded ? cur : null;
  }, { label: `${deal.dealCode} diputus agent (Refunded)`, timeoutMs: 180000 });
  const verdict = await j(`/api/deals/${deal.dealCode}`).then((r) => r.verdict);
  assert(verdict?.commit?.outcome === "REFUND", `commit.outcome harus REFUND, dapat ${verdict?.commit?.outcome}`);
  assert(verdict.verdictHash === d.verdictHash, "verdictHash file agent harus cocok on-chain");
  const evHash = await eventVerdictHash(deal.dealId, "Refunded");
  assert(evHash === d.verdictHash, "verdictHash event Refunded harus sama dengan getDeal()");
  console.log("   ✅ lulus —", deal.dealCode);
}

async function scenarioReleaseByAiWithResponse() {
  console.log("\n3) RELEASE via hakim AI (bukti SESUAI + penjual menanggapi)");
  const seller = privateKeyToAccount(generatePrivateKey());
  const buyer = privateKeyToAccount(generatePrivateKey());
  const deal = await publishDeal(seller, { title: "iPhone 13 — mulus tapi dikomplain", price: 8_500_000, markerText: "SESUAI" });
  await fundDeal(buyer, seller.address, deal);
  await shipDeal(seller, deal);
  await disputeDeal(buyer, deal);
  await respondDeal(seller, deal, "Barang sudah dicek sebelum dikirim, kondisi mulus sesuai foto.");
  const d = await waitFor(async () => {
    const cur = await onchain(deal.dealId);
    return cur.status === Status.Released ? cur : null;
  }, { label: `${deal.dealCode} diputus agent (Released)`, timeoutMs: 180000 });
  const verdict = await j(`/api/deals/${deal.dealCode}`).then((r) => r.verdict);
  assert(verdict?.commit?.outcome === "RELEASE", `commit.outcome harus RELEASE, dapat ${verdict?.commit?.outcome}`);
  assert(verdict.verdictHash === d.verdictHash, "verdictHash file agent harus cocok on-chain");
  const evHash = await eventVerdictHash(deal.dealId, "Released");
  assert(evHash === d.verdictHash, "verdictHash event Released harus sama dengan getDeal()");
  console.log("   ✅ lulus —", deal.dealCode);
}

async function scenarioEscalateThenHuman() {
  console.log("\n4) ESCALATE (bukti ambigu) -> human-resolve.ts");
  const seller = privateKeyToAccount(generatePrivateKey());
  const buyer = privateKeyToAccount(generatePrivateKey());
  const deal = await publishDeal(seller, { title: "iPhone 13 — ambigu", price: 8_500_000 }); // tanpa BATU/SESUAI -> UNSURE
  await fundDeal(buyer, seller.address, deal);
  await shipDeal(seller, deal);
  await disputeDeal(buyer, deal);
  await waitFor(async () => {
    const cur = await onchain(deal.dealId);
    return cur.status === Status.Escalated ? cur : null;
  }, { label: `${deal.dealCode} dieskalasi agent`, timeoutMs: 180000 });
  console.log("   🙋 dieskalasi, menjalankan human-resolve.ts...");
  await runHumanResolve(deal.dealCode, "release", "Sudah dicek manual, barang sesuai — smoke test R-11");
  const d = await onchain(deal.dealId);
  assert(d.status === Status.Released, `status harus Released setelah putusan manusia, dapat ${d.status}`);
  const verdict = await j(`/api/deals/${deal.dealCode}`).then((r) => r.verdict);
  assert(verdict?.commit?.model === "human", "commit.model harus 'human'");
  assert(verdict.verdictHash === d.verdictHash, "verdictHash verdict file harus cocok on-chain");
  const evHash = await eventVerdictHash(deal.dealId, "Released");
  assert(evHash === d.verdictHash, "verdictHash event Released harus sama dengan getDeal()");
  console.log("   ✅ lulus —", deal.dealCode);
}

async function scenarioConfirmTimeout() {
  console.log("\n5) Timeout konfirmasi -> releaseUnconfirmed (siapa pun bisa memicu)");
  const seller = privateKeyToAccount(generatePrivateKey());
  const buyer = privateKeyToAccount(generatePrivateKey());
  const deal = await publishDeal(seller, { title: "iPhone 13 — pembeli diam", price: 8_500_000 });
  await fundDeal(buyer, seller.address, deal);
  await shipDeal(seller, deal);

  const confirmWindow = await publicClient.readContract({ address: deployment.escrow, abi: escrowAbi, functionName: "confirmWindow" });

  // snapshot/revert (bukan cuma increaseTime telanjang) — evm_increaseTime memajukan jam
  // CHAIN permanen untuk sisa umur node hardhat ini; agent/src/loop.ts membandingkan
  // disputedAt (jam chain) dengan Date.now() (jam host) buat jendela tanggapan penjual, jadi
  // drift permanen bikin skenario 2-4 gagal timeout kalau smoke test dijalankan lagi melawan
  // node yang sama. evm_revert mengembalikan jam chain (bukan cuma state) ke titik snapshot.
  const snapshotId = await testClient.snapshot();
  let d;
  try {
    await testClient.increaseTime({ seconds: Number(confirmWindow) + 60 });
    await testClient.mine({ blocks: 1 });

    const bystander = privateKeyToAccount(BYSTANDER_KEY);
    const walletClient = createWalletClient({ account: bystander, chain: hardhat, transport: http(RPC_URL) });
    const { request } = await publicClient.simulateContract({
      account: bystander, address: deployment.escrow, abi: escrowAbi, functionName: "releaseUnconfirmed", args: [deal.dealId],
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });

    d = await onchain(deal.dealId);
    assert(d.status === Status.Released, `status harus Released via timeout, dapat ${d.status}`);
    assert(d.verdictHash === ZERO_HASH, "releaseUnconfirmed tidak melibatkan AI — verdictHash harus 0x0");
  } finally {
    await testClient.revert({ id: snapshotId });
  }
  console.log("   ✅ lulus —", deal.dealCode, `(confirmWindow ${confirmWindow}s dilewati)`);
}

async function main() {
  await scenarioReleaseByConfirm();
  await scenarioRefundByAi();
  await scenarioReleaseByAiWithResponse();
  await scenarioEscalateThenHuman();
  await scenarioConfirmTimeout();
  console.log("\n🎉 SMOKE TEST LULUS (5 skenario)");
}

main().catch((err) => {
  console.error("\n❌ SMOKE TEST GAGAL:", err.message);
  process.exit(1);
});
