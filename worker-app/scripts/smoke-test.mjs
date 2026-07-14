/**
 * Smoke test end-to-end untuk worker-app (relayer API) melawan proses agent
 * yang sedang berjalan (mode mock). Mensimulasikan yang dilakukan browser:
 * claim -> upload foto -> tunggu dibayar -> cek riwayat gaji.
 *
 * Prasyarat: hardhat node + deploy sudah jalan, agent mission sedang berjalan,
 * worker-app dev server sedang berjalan di BASE_URL.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3001";
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

async function main() {
  const worker = privateKeyToAccount(generatePrivateKey());
  console.log(`👷 Smoke-test worker: ${worker.address}`);

  const tasks = await waitFor(
    async () => {
      const res = await fetch(`${BASE}/api/tasks`);
      const data = await res.json();
      return data.tasks?.length > 0 ? data.tasks : null;
    },
    { label: "task Open muncul di /api/tasks" },
  );
  console.log(`📋 Ditemukan ${tasks.length} task Open`);

  for (const t of tasks) {
    console.log(`\n➡️  Task #${t.taskId} "${t.spec.title}"`);

    const claimRes = await fetch(`${BASE}/api/tasks/${t.taskId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerAddress: worker.address }),
    });
    if (!claimRes.ok) throw new Error(`Claim gagal: ${JSON.stringify(await claimRes.json())}`);
    console.log("   ✅ Claim berhasil");

    const form = new FormData();
    form.append("workerAddress", worker.address);
    form.append("photo", new Blob([Buffer.from("fake-photo-bytes-" + t.taskId)], { type: "image/jpeg" }), "bukti.jpg");
    const submitRes = await fetch(`${BASE}/api/tasks/${t.taskId}/submit`, { method: "POST", body: form });
    if (!submitRes.ok) throw new Error(`Submit gagal: ${JSON.stringify(await submitRes.json())}`);
    const submitData = await submitRes.json();
    console.log(`   ✅ Bukti terkirim (proofHash ${submitData.proofHash.slice(0, 14)}...)`);

    await waitFor(
      async () => {
        const res = await fetch(`${BASE}/api/tasks/${t.taskId}`);
        const data = await res.json();
        return data.status === 4 ? data : null; // Status.Paid
      },
      { label: `task #${t.taskId} dibayar agent`, timeoutMs: 30000 },
    );
    console.log("   💸 Dibayar agent (status Paid dikonfirmasi via API)");
  }

  const historyRes = await fetch(`${BASE}/api/history?worker=${worker.address}`);
  const history = await historyRes.json();
  if (history.items.length !== tasks.length) {
    throw new Error(`Riwayat gaji tidak sesuai: expected ${tasks.length} item, dapat ${history.items.length}`);
  }
  console.log(`\n🎉 SMOKE TEST WORKER-APP LULUS — total pendapatan Rp ${Number(BigInt(history.total)) / 100}`);
}

main().catch((err) => {
  console.error("\n❌ SMOKE TEST GAGAL:", err.message);
  process.exit(1);
});
