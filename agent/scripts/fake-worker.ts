/**
 * Simulasi worker untuk smoke test lokal (chain 31337 SAJA).
 * Berperan sebagai relayer: claimFor + submitProofFor atas nama worker,
 * lalu menunggu sampai semua task yang di-claim dibayar oleh agent.
 */
import "dotenv/config";
import { createPublicClient, createWalletClient, http, keccak256, toHex, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const abi = JSON.parse(fs.readFileSync(path.join(here, "..", "src", "abi", "TaskEscrow.json"), "utf8"));
const idrxAbi = JSON.parse(fs.readFileSync(path.join(here, "..", "src", "abi", "MockIDRX.json"), "utf8"));
const deployment = JSON.parse(
  fs.readFileSync(path.join(here, "..", "..", "contracts", "deployments", "localhost.json"), "utf8"),
);

// Kunci uji hardhat yang publik & well-known — HANYA untuk chain lokal 31337.
const RELAYER_KEY = (process.env.RELAYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`;
const WORKER_ADDRESS = (process.env.WORKER_ADDRESS ||
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8") as `0x${string}`;

const relayer = privateKeyToAccount(RELAYER_KEY);
const publicClient = createPublicClient({ chain: hardhat, transport: http("http://127.0.0.1:8545") });
const walletClient = createWalletClient({ account: relayer, chain: hardhat, transport: http("http://127.0.0.1:8545") });

const Status = { Open: 1, Claimed: 2, Submitted: 3, Paid: 4 } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function write(functionName: string, args: unknown[]) {
  const { request } = await publicClient.simulateContract({
    account: relayer,
    address: deployment.escrow,
    abi,
    functionName,
    args,
  });
  const hash = await walletClient.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash });
}

async function main() {
  console.log(`👷 Fake worker aktif. Worker: ${WORKER_ADDRESS}, relayer: ${relayer.address}`);
  const claimed = new Set<string>();
  const started = Date.now();

  while (Date.now() - started < 120_000) {
    const nextId = (await publicClient.readContract({
      address: deployment.escrow,
      abi,
      functionName: "nextTaskId",
    })) as bigint;

    let allMinePaid = claimed.size > 0;
    for (let id = 0n; id < nextId; id++) {
      const task = (await publicClient.readContract({
        address: deployment.escrow,
        abi,
        functionName: "getTask",
        args: [id],
      })) as { status: number; worker: string };

      if (task.status === Status.Open) {
        console.log(`👷 Claim task #${id}...`);
        await write("claimFor", [id, WORKER_ADDRESS]);
        // Verifier baru butuh file bukti nyata yang mengandung kode tantangan —
        // baca challenge dari mission state dan tulis file ke uploads/ seperti worker-app.
        const missions = JSON.parse(
          fs.readFileSync(path.join(here, "..", "missions", "current.json"), "utf8"),
        ) as { tasks: { taskId: string; spec: { challenge: string } }[] };
        const challenge = missions.tasks.find((t) => t.taskId === id.toString())?.spec.challenge ?? "";
        const proofBytes = Buffer.from(`fake-proof-${id}-${Date.now()} kode: ${challenge}`);
        const proofHash = keccak256(proofBytes);
        const uploadsDir = path.join(here, "..", "..", "worker-app", "uploads");
        fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, proofHash.slice(2) + ".jpg"), proofBytes);
        await write("submitProofFor", [id, WORKER_ADDRESS, proofHash]);
        console.log(`👷 Bukti task #${id} disubmit (${proofHash.slice(0, 14)}...)`);
        claimed.add(id.toString());
        allMinePaid = false;
      } else if (claimed.has(id.toString()) && task.status !== Status.Paid) {
        allMinePaid = false;
      }
    }

    if (allMinePaid && claimed.size > 0) {
      const balance = (await publicClient.readContract({
        address: deployment.idrx,
        abi: idrxAbi,
        functionName: "balanceOf",
        args: [WORKER_ADDRESS],
      })) as bigint;
      console.log(`\n🎉 Semua task worker dibayar! Saldo worker: Rp ${Number(formatUnits(balance, 2)).toLocaleString("id-ID")}`);
      return;
    }
    await sleep(2000);
  }
  throw new Error("Timeout: task tidak selesai dalam 120s");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
