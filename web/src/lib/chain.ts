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
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import { hardhat, base, baseSepolia, bsc, bscTestnet } from "viem/chains";
import { config } from "./config";

const loadAbi = (name: string): Abi =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "abi", `${name}.json`), "utf8"));

export const escrowAbi = loadAbi("RekberEscrow");
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
// O-08 (pelajaran MANDOR): relayer mengirim tx untuk banyak pengguna berbarengan (fund/act
// paralel dari beberapa HP). Tanpa nonceManager, dua request bersamaan bisa dapat nonce yang
// sama dan salah satu revert "nonce too low" — nonceManager menyerialkan alokasi nonce.
const relayer = privateKeyToAccount(config.relayerPrivateKey, { nonceManager });
export const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
const walletClient = createWalletClient({ account: relayer, chain, transport: http(config.rpcUrl) });

// Status enum harus sinkron dengan RekberEscrow.sol
export const Status = {
  None: 0,
  Funded: 1,
  Shipped: 2,
  Disputed: 3,
  Escalated: 4,
  Released: 5,
  Refunded: 6,
  Split: 7,
} as const;
export type StatusValue = (typeof Status)[keyof typeof Status];

export interface OnchainDeal {
  buyer: Address;
  seller: Address;
  amount: bigint;
  fundedAt: number;
  shippedAt: number;
  disputedAt: number;
  status: number;
  specHash: Hex;
  shipmentHash: Hex;
  disputeHash: Hex;
  verdictHash: Hex;
}

/** Terms.dealId/seller/amount/specHash/offerDeadline — persis struct Terms di kontrak. */
export interface OfferTerms {
  dealId: Hex;
  seller: Address;
  amount: bigint;
  specHash: Hex;
  offerDeadline: bigint;
}

async function write(address: Address, abi: Abi, functionName: string, args: unknown[]) {
  const { request } = await publicClient.simulateContract({ account: relayer, address, abi, functionName, args });
  const hash = await walletClient.writeContract(request);
  return publicClient.waitForTransactionReceipt({ hash });
}

export async function getDeal(dealId: Hex): Promise<OnchainDeal> {
  return (await publicClient.readContract({
    address: config.escrowAddress,
    abi: escrowAbi,
    functionName: "getDeal",
    args: [dealId],
  })) as OnchainDeal;
}

/** Relayer mendanai deal atas nama pembeli. Semua field (buyer/seller/amount/specHash) ikut
 * ditandatangani pembeli & penjual (Fund/Offer) — relayer cuma membayar gas, tidak bisa
 * mengubah isi transaksi. permitSig kosong ("0x") = pembeli sudah approve() manual. */
export async function fundWithSig(
  terms: OfferTerms,
  buyer: Address,
  fundDeadline: bigint,
  offerSig: Hex,
  fundSig: Hex,
  permitDeadline: bigint,
  permitSig: Hex,
) {
  return write(config.escrowAddress, escrowAbi, "fundWithSig", [
    terms,
    buyer,
    fundDeadline,
    offerSig,
    fundSig,
    permitDeadline,
    permitSig,
  ]);
}

/** Relayer mengirim ship/confirm/dispute atas nama pengguna. Penanda tangan yang di-recover
 * dari `sig` diverifikasi kontrak sendiri (harus penjual untuk Ship, pembeli untuk
 * Confirm/Dispute) — relayer tidak bisa mengaku jadi orang lain. */
export async function act(dealId: Hex, action: 0 | 1 | 2, data: Hex, deadline: bigint, sig: Hex) {
  return write(config.escrowAddress, escrowAbi, "act", [dealId, action, data, deadline, sig]);
}

/** Faucet demo — testnet/lokal saja, ditolak di /api/faucet kalau CHAIN_ID mainnet. */
export async function mint(to: Address, amount: bigint) {
  return write(config.tokenAddress, idrxAbi, "mint", [to, amount]);
}

export async function permitNonce(owner: Address): Promise<bigint> {
  return (await publicClient.readContract({
    address: config.tokenAddress,
    abi: idrxAbi,
    functionName: "nonces",
    args: [owner],
  })) as bigint;
}

/** Jendela waktu kontrak (immutable) — dibaca langsung dari chain, bukan file deploy,
 * supaya selalu akurat baik di localhost maupun testnet. Dipakai UI untuk countdown. */
export async function getWindows(): Promise<{ shipWindow: number; confirmWindow: number; disputeWindow: number }> {
  const [shipWindow, confirmWindow, disputeWindow] = await Promise.all([
    publicClient.readContract({ address: config.escrowAddress, abi: escrowAbi, functionName: "shipWindow" }),
    publicClient.readContract({ address: config.escrowAddress, abi: escrowAbi, functionName: "confirmWindow" }),
    publicClient.readContract({ address: config.escrowAddress, abi: escrowAbi, functionName: "disputeWindow" }),
  ]);
  return { shipWindow: shipWindow as number, confirmWindow: confirmWindow as number, disputeWindow: disputeWindow as number };
}

export async function balanceOf(owner: Address): Promise<bigint> {
  return (await publicClient.readContract({
    address: config.tokenAddress,
    abi: idrxAbi,
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;
}

const REVERT_MESSAGES: Record<string, string> = {
  DealExists: "Kode transaksi ini sudah dipakai — coba buat transaksi baru",
  ZeroAmount: "Harga tidak boleh nol",
  ZeroAddress: "Alamat penjual tidak valid",
  ZeroHash: "Bukti tidak boleh kosong",
  SelfDeal: "Penjual dan pembeli tidak boleh alamat yang sama",
  InvalidState: "Status transaksi sudah berubah — coba muat ulang halaman",
  NotBuyer: "Hanya pembeli transaksi ini yang bisa melakukan aksi ini",
  NotSeller: "Hanya penjual transaksi ini yang bisa melakukan aksi ini",
  NotArbiter: "Hanya arbiter yang bisa memutus sengketa ini",
  BadSignature: "Tanda tangan tidak valid — coba ulangi",
  SignatureExpired: "Waktu tanda tangan sudah kedaluwarsa — coba ulangi",
  WindowClosed: "Batas waktu untuk aksi ini sudah lewat",
  WindowStillOpen: "Belum waktunya — batas waktu belum lewat",
  FeeTooHigh: "Fee melebihi batas maksimum",
};

/** Ubah revert kontrak jadi pesan Bahasa Indonesia yang bisa ditampilkan ke pengguna. */
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
