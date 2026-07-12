import fs from "node:fs";
import path from "node:path";
import { keccak256, toHex, formatUnits } from "viem";
import { config } from "./config.js";
import { planTasks, verifyProof } from "./brain.js";
import { getProof } from "./proof-store.js";
import {
  account,
  approveToken,
  getTask,
  postTask,
  rejectAndReopen,
  releaseBounty,
  Status,
  tokenBalance,
} from "./chain.js";
import type { HumanTaskSpec, Verdict } from "./types.js";

const POLL_MS = 3000;
const MAX_VERIFY_ATTEMPTS = 3;

interface TrackedTask {
  taskId: bigint;
  spec: HumanTaskSpec;
  lastTriedProof: string | null;
  verifyAttempts: number;
  verdict: Verdict | null;
  paid: boolean;
}

const rupiah = (v: bigint | number) => `Rp ${Number(formatUnits(BigInt(v), 2)).toLocaleString("id-ID")}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runMission(goal: string): Promise<void> {
  console.log(`\n🧠 MANDOR mulai bekerja.\n   Goal: ${goal}\n   Wallet agent: ${account.address}`);

  const specs = await planTasks(goal);
  const totalBounty = specs.reduce((sum, s) => sum + BigInt(s.bountyIDRX), 0n);
  const balance = await tokenBalance(account.address);
  console.log(`\n📋 Rencana: ${specs.length} task, total upah ${rupiah(totalBounty)} (saldo agent ${rupiah(balance)})`);
  if (balance < totalBounty) throw new Error("Saldo IDRX agent tidak cukup untuk total upah");

  await approveToken(totalBounty);
  const deadline = Math.floor(Date.now() / 1000) + config.taskDeadlineMinutes * 60;

  const tracked: TrackedTask[] = [];
  for (const spec of specs) {
    const specHash = keccak256(toHex(JSON.stringify(spec)));
    const taskId = await postTask(BigInt(spec.bountyIDRX), specHash, deadline);
    tracked.push({ taskId, spec, lastTriedProof: null, verifyAttempts: 0, verdict: null, paid: false });
    console.log(`   ⛓️  Task #${taskId} "${spec.title}" — ${rupiah(spec.bountyIDRX)} terkunci di escrow`);
  }
  saveMissionState(goal, tracked);

  console.log(`\n👀 Menunggu pekerja manusia... (poll tiap ${POLL_MS / 1000}s)`);
  while (tracked.some((t) => !t.paid)) {
    await sleep(POLL_MS);
    for (const t of tracked) {
      if (t.paid) continue;
      const onchain = await getTask(t.taskId);

      if (onchain.status === Status.Paid) {
        t.paid = true;
        continue;
      }
      if (onchain.status !== Status.Submitted) continue;
      if (t.lastTriedProof === onchain.proofHash) continue; // sudah dinilai, menunggu perubahan

      console.log(`\n📸 Task #${t.taskId}: bukti masuk dari ${onchain.worker}`);
      t.lastTriedProof = onchain.proofHash;
      t.verifyAttempts += 1;

      // Mode mock tidak punya file bukti nyata — verifikasi langsung ke mock verifier.
      const proof = config.mockBrain
        ? { base64: "", mediaType: "image/jpeg" as const }
        : getProof(onchain.proofHash);
      let verdict: Verdict;
      if (!proof) {
        verdict = { decision: "fail", reasoning: "File bukti tidak ditemukan di proof store" };
      } else {
        try {
          verdict = await verifyProof(t.spec, proof);
        } catch (err) {
          console.log(`   ⚠️ Verifikasi error (${(err as Error).message}) — dicoba lagi di tick berikutnya`);
          t.lastTriedProof = null; // biarkan dicoba ulang
          if (t.verifyAttempts >= MAX_VERIFY_ATTEMPTS) {
            console.log(`   ⛔ ${MAX_VERIFY_ATTEMPTS}x gagal verifikasi — task dibiarkan Submitted (worker terlindungi forceRelease)`);
            t.lastTriedProof = onchain.proofHash;
          }
          continue;
        }
      }

      t.verdict = verdict;
      if (verdict.decision === "pass") {
        await releaseBounty(t.taskId);
        t.paid = true;
        console.log(`   ✅ LULUS — ${verdict.reasoning}`);
        console.log(`   💸 ${rupiah(t.spec.bountyIDRX)} dibayarkan ke ${onchain.worker}`);
      } else {
        await rejectAndReopen(t.taskId);
        console.log(`   ❌ DITOLAK — ${verdict.reasoning}`);
        console.log(`   🔄 Task #${t.taskId} dibuka lagi untuk worker lain`);
      }
      saveMissionState(goal, tracked);
    }
  }

  const report = buildReport(goal, tracked);
  const reportPath = saveReport(report);
  console.log(`\n🏁 MISSION COMPLETE — semua task terbayar.\n📄 Laporan: ${reportPath}\n`);
  console.log(report);
}

function missionsDir(): string {
  const dir = path.resolve("missions");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveMissionState(goal: string, tracked: TrackedTask[]) {
  const state = {
    goal,
    updatedAt: new Date().toISOString(),
    tasks: tracked.map((t) => ({
      taskId: t.taskId.toString(),
      spec: t.spec,
      paid: t.paid,
      verdict: t.verdict,
    })),
  };
  fs.writeFileSync(path.join(missionsDir(), "current.json"), JSON.stringify(state, null, 2));
}

function buildReport(goal: string, tracked: TrackedTask[]): string {
  const lines = [
    `# Laporan Misi MANDOR`,
    ``,
    `**Goal:** ${goal}`,
    `**Selesai:** ${new Date().toISOString()}`,
    ``,
    `| Task | Upah | Status | Catatan verifikasi |`,
    `|---|---|---|---|`,
  ];
  for (const t of tracked) {
    lines.push(
      `| #${t.taskId} ${t.spec.title} | ${rupiah(t.spec.bountyIDRX)} | ${t.paid ? "DIBAYAR" : "-"} | ${t.verdict?.reasoning ?? "-"} |`,
    );
  }
  return lines.join("\n");
}

function saveReport(report: string): string {
  const p = path.join(missionsDir(), `report-${Date.now()}.md`);
  fs.writeFileSync(p, report);
  return p;
}
