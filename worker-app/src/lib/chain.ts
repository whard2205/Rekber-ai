import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  BaseError,
  ContractFunctionRevertedError,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat, base, baseSepolia, bsc, bscTestnet } from "viem/chains";
import { config } from "./config";

const loadAbi = (name: string): Abi =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "abi", `${name}.json`), "utf8"));

export const escrowAbi = loadAbi("TaskEscrow");
export const idrxAbi = loadAbi("MockIDRX");

const KNOWN_CHAINS: Record<number, typeof hardhat> = {
  31337: hardhat,
  56: bsc as never,
  97: bscTestnet as never,
  8453: base as never,
  84532: baseSepolia as never,
};

function resolveChain(chainId: number, rpcUrl: string) {
  return (
    KNOWN_CHAINS[chainId] ??
    defineChain({
      id: chainId,
      name: `chain-${chainId}`,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    })
  );
}

const chain = resolveChain(config.chainId, config.rpcUrl);
const relayer = privateKeyToAccount(config.relayerPrivateKey);
export const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
const walletClient = createWalletClient({ account: relayer, chain, transport: http(config.rpcUrl) });

// Status enum harus sinkron dengan TaskEscrow.sol
export const Status = { None: 0, Open: 1, Claimed: 2, Submitted: 3, Paid: 4, Refunded: 5 } as const;
export type StatusValue = (typeof Status)[keyof typeof Status];

export interface OnchainTask {
  agent: Address;
  token: Address;
  bounty: bigint;
  specHash: Hex;
  worker: Address;
  proofHash: Hex;
  deadline: number;
  submittedAt: number;
  status: number;
}

async function write(functionName: string, args: unknown[]) {
  const { request } = await publicClient.simulateContract({
    account: relayer,
    address: config.escrowAddress,
    abi: escrowAbi,
    functionName,
    args,
  });
  const hash = await walletClient.writeContract(request);
  return publicClient.waitForTransactionReceipt({ hash });
}

export async function getTask(taskId: bigint): Promise<OnchainTask> {
  return (await publicClient.readContract({
    address: config.escrowAddress,
    abi: escrowAbi,
    functionName: "getTask",
    args: [taskId],
  })) as OnchainTask;
}

/** Worker claim task lewat relayer — worker tidak perlu ETH untuk gas. */
export async function claimFor(taskId: bigint, worker: Address) {
  return write("claimFor", [taskId, worker]);
}

/** Worker submit bukti lewat relayer. proofHash = keccak256 file bukti. */
export async function submitProofFor(taskId: bigint, worker: Address, proofHash: Hex) {
  return write("submitProofFor", [taskId, worker, proofHash]);
}

export async function tokenBalance(owner: Address): Promise<bigint> {
  return (await publicClient.readContract({
    address: config.tokenAddress,
    abi: idrxAbi,
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;
}

export interface BountyReleasedEvent {
  taskId: bigint;
  worker: Address;
  amount: bigint;
  transactionHash: Hex;
  blockNumber: bigint;
}

/** Riwayat gaji: semua BountyReleased untuk satu alamat worker. */
export async function getPayoutsFor(worker: Address): Promise<BountyReleasedEvent[]> {
  const logs = await publicClient.getContractEvents({
    address: config.escrowAddress,
    abi: escrowAbi,
    eventName: "BountyReleased",
    args: { worker },
    fromBlock: 0n,
    toBlock: "latest",
  });
  return logs.map((l) => {
    const args = l.args as { taskId: bigint; worker: Address; amount: bigint };
    return {
      taskId: args.taskId,
      worker: args.worker,
      amount: args.amount,
      transactionHash: l.transactionHash!,
      blockNumber: l.blockNumber!,
    };
  });
}

const REVERT_MESSAGES: Record<string, string> = {
  InvalidState: "Status task sudah berubah — coba refresh halaman",
  NotWorker: "Task ini sedang di-claim oleh alamat lain",
  NotRelayer: "Hanya relayer resmi yang boleh melakukan aksi ini",
  DeadlinePassed: "Batas waktu task ini sudah lewat",
};

/** Ubah revert kontrak jadi pesan bahasa Indonesia yang bisa ditampilkan ke worker. */
export function translateChainError(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name) return REVERT_MESSAGES[name] ?? `Transaksi ditolak kontrak: ${name}`;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
}
