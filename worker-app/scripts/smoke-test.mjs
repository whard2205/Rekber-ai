/**
 * Smoke test end-to-end untuk worker-app (relayer API) melawan proses agent
 * yang sedang berjalan (mode mock). Mensimulasikan yang dilakukan browser,
 * termasuk jalur negatif anti-cheat:
 *   1. submit bukti TANPA kode tantangan  -> agent REJECT, task dibuka lagi
 *   2. submit ulang dengan kode tantangan -> APPROVE + dibayar
 *   3. daur ulang foto yang sama di task lain -> API 409 duplikat
 *   4. submit bukti unik + kode           -> dibayar
 *   5. riwayat gaji terkonfirmasi
 *
 * Prasyarat: hardhat node + deploy jalan, agent mission jalan (MANDOR_MOCK_BRAIN=1),
 * worker-app dev server jalan di BASE_URL.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3001";
const Status = { Open: 1, Claimed: 2, Submitted: 3, Paid: 4 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeoutMs = 60000, intervalMs = 1500, label }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(intervalMs);
  }
  throw new Error(`Timeout menunggu: ${label}`);
}

async function getDetail(taskId) {
  const res = await fetch(`${BASE}/api/tasks/${taskId}`);
  return res.json();
}

async function claim(taskId, worker) {
  const res = await fetch(`${BASE}/api/tasks/${taskId}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerAddress: worker.address }),
  });
  if (!res.ok) throw new Error(`Claim gagal: ${JSON.stringify(await res.json())}`);
}

async function submit(taskId, worker, bytes) {
  const form = new FormData();
  form.append("workerAddress", worker.address);
  form.append("photo", new Blob([bytes], { type: "image/jpeg" }), "bukti.jpg");
  const res = await fetch(`${BASE}/api/tasks/${taskId}/submit`, { method: "POST", body: form });
  return { status: res.status, body: await res.json() };
}

async function main() {
  const worker = privateKeyToAccount(generatePrivateKey());
  console.log(`👷 Smoke-test worker: ${worker.address}`);

  const tasks = await waitFor(
    async () => {
      const res = await fetch(`${BASE}/api/tasks`);
      const data = await res.json();
      return data.tasks?.length >= 2 ? data.tasks : null;
    },
    { label: "minimal 2 task Open muncul di /api/tasks" },
  );
  const [taskA, taskB] = tasks;
  if (!taskA.spec.challenge) throw new Error("Task tidak punya kode tantangan — challenge flow rusak");
  console.log(`📋 ${tasks.length} task Open. Challenge A: ${taskA.spec.challenge}, B: ${taskB.spec.challenge}`);

  // --- Skenario 1: bukti TANPA kode tantangan -> REJECT ---
  console.log(`\n➡️  [1] Task #${taskA.taskId}: submit bukti TANPA kode tantangan`);
  await claim(taskA.taskId, worker);
  const bad = await submit(taskA.taskId, worker, Buffer.from(`foto lama tanpa kode ${Date.now()}`));
  if (bad.status !== 200) throw new Error(`Submit bukti buruk harusnya diterima API: ${JSON.stringify(bad.body)}`);
  const rejected = await waitFor(
    async () => {
      const d = await getDetail(taskA.taskId);
      return d.status === Status.Open && d.lastVerdict?.decision === "REJECT" ? d : null;
    },
    { label: "agent me-REJECT bukti tanpa kode", timeoutMs: 30000 },
  );
  console.log(`   ❌ Ditolak agent sesuai harapan. Alasan: ${rejected.lastVerdict.reasons.join("; ")}`);

  // --- Skenario 2: submit ulang DENGAN kode -> APPROVE + dibayar ---
  console.log(`\n➡️  [2] Task #${taskA.taskId}: submit ulang DENGAN kode tantangan`);
  await claim(taskA.taskId, worker);
  const goodBytesA = Buffer.from(`foto jempol baru ${Date.now()} kode: ${taskA.spec.challenge}`);
  const goodA = await submit(taskA.taskId, worker, goodBytesA);
  if (goodA.status !== 200) throw new Error(`Submit bukti valid gagal: ${JSON.stringify(goodA.body)}`);
  const paidA = await waitFor(
    async () => {
      const d = await getDetail(taskA.taskId);
      return d.status === Status.Paid ? d : null;
    },
    { label: `task #${taskA.taskId} dibayar`, timeoutMs: 30000 },
  );
  console.log(`   💸 Dibayar (payout tx ${paidA.payoutTxHash?.slice(0, 14)}...)`);

  // --- Skenario 3: daur ulang foto task A untuk task B -> 409 duplikat ---
  console.log(`\n➡️  [3] Task #${taskB.taskId}: coba daur ulang foto task A`);
  await claim(taskB.taskId, worker);
  const dup = await submit(taskB.taskId, worker, goodBytesA);
  if (dup.status !== 409) throw new Error(`Duplikat harusnya 409, dapat ${dup.status}: ${JSON.stringify(dup.body)}`);
  console.log(`   🚫 Ditolak API (409): ${dup.body.error}`);

  // --- Skenario 4: bukti unik + kode task B -> dibayar ---
  console.log(`\n➡️  [4] Task #${taskB.taskId}: submit bukti unik dengan kode`);
  const goodB = await submit(taskB.taskId, worker, Buffer.from(`foto unik ${Date.now()} kode: ${taskB.spec.challenge}`));
  if (goodB.status !== 200) throw new Error(`Submit bukti valid B gagal: ${JSON.stringify(goodB.body)}`);
  await waitFor(
    async () => {
      const d = await getDetail(taskB.taskId);
      return d.status === Status.Paid ? d : null;
    },
    { label: `task #${taskB.taskId} dibayar`, timeoutMs: 30000 },
  );
  console.log(`   💸 Dibayar`);

  // --- Skenario 5: riwayat gaji ---
  const historyRes = await fetch(`${BASE}/api/history?worker=${worker.address}`);
  const history = await historyRes.json();
  if (history.items.length !== 2) {
    throw new Error(`Riwayat gaji tidak sesuai: expected 2 item, dapat ${history.items.length}`);
  }
  console.log(`\n🎉 SMOKE TEST LULUS (5 skenario) — total pendapatan Rp ${Number(BigInt(history.total)) / 100}`);
}

main().catch((err) => {
  console.error("\n❌ SMOKE TEST GAGAL:", err.message);
  process.exit(1);
});
