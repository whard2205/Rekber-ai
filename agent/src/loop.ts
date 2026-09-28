import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { keccak256, toHex, formatUnits } from "viem";
import { config } from "./config.js";
import { planTasks } from "./brain.js";
import { getProof } from "./proof-store.js";
import {
  createModelVerifier,
  ProofRegistry,
  evaluateProof,
  type VerifierVerdict,
} from "./verifier.js";
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
import type { HumanTaskSpec } from "./types.js";

const POLL_MS = 3000;
const MAX_API_RETRIES = 3;

interface TrackedTask {
  taskId: bigint;
  spec: HumanTaskSpec;
  lastTriedProof: string | null;
  apiRetries: number;
  verifications: number;
  verdict: VerifierVerdict | null;
  payoutTxHash: string | null;
  paid: boolean;
}

const rupiah = (v: bigint | number) => `Rp ${Number(formatUnits(BigInt(v), 2)).toLocaleString("id-ID")}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Kode tantangan anti-cheat, tanpa karakter ambigu (0/O, 1/I/L). */
function generateChallenge(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return `MDR-${code}`;
}

export async function runMission(goal: string): Promise<void> {
  console.log(`\n🧠 MANDOR mulai bekerja.\n   Goal: ${goal}\n   Wallet agent: ${account.address}`);

  const model = createModelVerifier(config);
  const registry = new ProofRegistry(path.join(missionsDir(), "proof-registry.json"));
  console.log(`   Verifier: ${model.name} (ambang confidence ${config.confidenceThreshold})`);

  const specs = await planTasks(goal);
  for (const spec of specs) spec.challenge = generateChallenge(); // agent yang membuat, bukan model

  const totalBounty = specs.reduce((sum, s) => sum + BigInt(s.bountyIDRX), 0n);
  const balance = await tokenBalance(account.address);
  console.log(`\n📋 Rencana: ${specs.length} task, total upah ${rupiah(totalBounty)} (saldo agent ${rupiah(balance)})`);
  if (balance < totalBounty) throw new Error("Saldo IDRX agent tidak cukup untuk total upah");

  await approveToken(totalBounty);
  const deadline = Math.floor(Date.now() / 1000) + config.taskDeadlineMinutes * 60;

  const tracked: TrackedTask[] = [];
  for (const spec of specs) {
    // challenge ikut di-hash -> komitmen on-chain, tamper-evident
    const specHash = keccak256(toHex(JSON.stringify(spec)));
    const taskId = await postTask(BigInt(spec.bountyIDRX), specHash, deadline);
    tracked.push({
      taskId,
      spec,
      lastTriedProof: null,
      apiRetries: 0,
      verifications: 0,
      verdict: null,
      payoutTxHash: null,
      paid: false,
    });
    console.log(`   ⛓️  Task #${taskId} "${spec.title}" [${spec.challenge}] — ${rupiah(spec.bountyIDRX)} terkunci di escrow`);
  }
  saveMissionState(goal, tracked);

  console.log(`\n👀 Menunggu pekerja manusia... (poll tiap ${POLL_MS / 1000}s)`);
  while (tracked.some((t) => !t.paid)) {
    await sleep(POLL_MS);
    for (const t of tracked) {
      if (t.paid) continue;
      // O-04: RPC publik (getTask/releaseBounty/rejectAndReopen) bisa gagal sementara
      // (timeout, rate limit) di testnet. Satu error tidak boleh mematikan seluruh misi —
      // task ini dicoba lagi di tick berikutnya, task lain tetap jalan.
      try {
        const onchain = await getTask(t.taskId);

        if (onchain.status === Status.Paid) {
          t.paid = true;
          continue;
        }
        if (onchain.status !== Status.Submitted) continue;
        if (t.lastTriedProof === onchain.proofHash) continue; // sudah dinilai, menunggu perubahan

        console.log(`\n📸 Task #${t.taskId}: bukti masuk dari ${onchain.worker}`);
        t.lastTriedProof = onchain.proofHash;

        let verdict: VerifierVerdict;
        if (t.verifications >= config.maxVerificationsPerTask) {
          verdict = {
            taskId: t.taskId.toString(),
            challengeMatched: false,
            requirementsMatched: false,
            duplicateDetected: false,
            confidence: 0,
            decision: "REJECT",
            reasons: [`Batas ${config.maxVerificationsPerTask}x percobaan verifikasi tercapai untuk task ini`],
            evidenceHash: onchain.proofHash,
          };
        } else {
          t.verifications += 1;
          try {
            verdict = await evaluateProof(
              {
                taskId: t.taskId.toString(),
                spec: t.spec,
                proof: getProof(onchain.proofHash),
                proofHash: onchain.proofHash,
                submittedAt: onchain.submittedAt,
                deadline: onchain.deadline,
              },
              { model, registry, confidenceThreshold: config.confidenceThreshold },
            );
            t.apiRetries = 0;
          } catch (err) {
            // Error API/jaringan (bukan keputusan) -> retry di tick berikutnya
            t.apiRetries += 1;
            console.log(`   ⚠️ Verifikasi error (${(err as Error).message}) — percobaan ${t.apiRetries}/${MAX_API_RETRIES}`);
            if (t.apiRetries < MAX_API_RETRIES) {
              t.lastTriedProof = null;
              continue;
            }
            console.log(`   ⛔ ${MAX_API_RETRIES}x error API — task dibiarkan Submitted (worker terlindungi forceRelease)`);
            continue;
          }
        }

        t.verdict = verdict;

        // O-09: verdict dikomit on-chain sebagai keccak256 dari field-field ini (urutan
        // key TETAP — JSON.stringify di sini adalah definisi kanonik dari verdictHash).
        // Audit log menyimpan field yang sama (lewat ...verdict + verifier di bawah),
        // jadi siapa pun bisa reproduksi hash ini dan mencocokkannya ke event
        // BountyReleased/TaskReopened di explorer.
        const verdictHash = keccak256(
          toHex(
            JSON.stringify({
              taskId: verdict.taskId,
              decision: verdict.decision,
              reasons: verdict.reasons,
              confidence: verdict.confidence,
              evidenceHash: verdict.evidenceHash,
              verifier: model.name,
            }),
          ),
        );

        let txHash: string;
        if (verdict.decision === "APPROVE") {
          const receipt = await releaseBounty(t.taskId, verdictHash);
          txHash = receipt.transactionHash;
          t.payoutTxHash = txHash;
          t.paid = true;
          console.log(`   ✅ APPROVE (confidence ${verdict.confidence.toFixed(2)}) — ${verdict.reasons.join("; ")}`);
          console.log(`   💸 ${rupiah(t.spec.bountyIDRX)} dibayarkan ke ${onchain.worker} (tx ${txHash.slice(0, 14)}...)`);
        } else {
          const receipt = await rejectAndReopen(t.taskId, verdictHash);
          txHash = receipt.transactionHash;
          console.log(`   ❌ REJECT — ${verdict.reasons.join("; ")}`);
          console.log(`   🔄 Task #${t.taskId} dibuka lagi untuk worker lain`);
        }
        appendAuditLog({
          ts: new Date().toISOString(),
          worker: onchain.worker,
          txHash,
          verifier: model.name,
          verdictHash,
          ...verdict,
        });
        saveMissionState(goal, tracked);
      } catch (err) {
        // RPC/chain gagal (getTask, atau tx release/reject) — bukan keputusan verifikasi.
        // Reset lastTriedProof supaya proof yang sama dievaluasi ulang tick berikutnya.
        // ponytail: bisa memicu 1 evaluasi ulang kalau yang gagal cuma tx-nya (verdict
        // sudah ada) — dibatasi MAX_VERIFICATIONS_PER_TASK, upgrade kalau perlu retry-tx murni.
        if (!t.paid) t.lastTriedProof = null;
        console.log(`   ⚠️ Task #${t.taskId}: error RPC/chain (${(err as Error).message}) — dicoba lagi tick berikutnya`);
      }
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

/** Jejak keputusan agent yang bisa diaudit (JSONL) — bahan dashboard & bukti juri. */
function appendAuditLog(entry: Record<string, unknown>) {
  fs.appendFileSync(path.join(missionsDir(), "audit-log.jsonl"), JSON.stringify(entry) + "\n");
}

function saveMissionState(goal: string, tracked: TrackedTask[]) {
  const state = {
    goal,
    updatedAt: new Date().toISOString(),
    tasks: tracked.map((t) => ({
      taskId: t.taskId.toString(),
      spec: t.spec,
      paid: t.paid,
      payoutTxHash: t.payoutTxHash,
      lastVerdict: t.verdict
        ? { decision: t.verdict.decision, reasons: t.verdict.reasons, confidence: t.verdict.confidence }
        : null,
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
      `| #${t.taskId} ${t.spec.title} | ${rupiah(t.spec.bountyIDRX)} | ${t.paid ? "DIBAYAR" : "-"} | ${t.verdict?.reasons.join("; ") ?? "-"} |`,
    );
  }
  return lines.join("\n");
}

function saveReport(report: string): string {
  const p = path.join(missionsDir(), `report-${Date.now()}.md`);
  fs.writeFileSync(p, report);
  return p;
}
