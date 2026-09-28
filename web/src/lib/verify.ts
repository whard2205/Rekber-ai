import "server-only";
import { verifyTypedData, verifyMessage, type Address, type Hex } from "viem";
import { rekberDomain, OFFER_TYPES, FUND_TYPES, ACT_TYPES } from "./eip712";

/** Verifikasi server-side tanda tangan sebelum tx dikirim (gas relayer tidak terbuang,
 * docs/rekber-ai/PLAN.md §3.6). Definisi typed data TUNGGAL di eip712.ts — tidak ada
 * duplikasi hashing. Mengembalikan alamat penanda tangan, atau melempar Error Bahasa
 * Indonesia yang aman ditampilkan ke pengguna. */

function fail(msg: string): never {
  throw new Error(msg);
}

export async function verifyOffer(args: {
  dealId: Hex;
  seller: Address;
  amount: bigint;
  specHash: Hex;
  deadline: bigint;
  sig: Hex;
}): Promise<Address> {
  // BUG SEBELUMNYA: verifyTypedData() adalah async function (Promise<boolean>) tapi
  // dipanggil tanpa await — Promise selalu truthy, jadi `if (!recovered)` TIDAK PERNAH
  // menolak signature apa pun. Diperbaiki: await + hasilnya boolean asli.
  const valid = await verifyTypedData({
    domain: rekberDomain,
    types: OFFER_TYPES,
    primaryType: "Offer",
    message: {
      dealId: args.dealId,
      seller: args.seller,
      amount: args.amount,
      specHash: args.specHash,
      deadline: args.deadline,
    },
    address: args.seller,
    signature: args.sig,
  });
  if (!valid) fail("Tanda tangan Offer bukan dari penjual — periksa wallet Anda");
  return args.seller;
}

export async function verifyFund(args: {
  dealId: Hex;
  buyer: Address;
  seller: Address;
  amount: bigint;
  specHash: Hex;
  deadline: bigint;
  sig: Hex;
}): Promise<Address> {
  const valid = await verifyTypedData({
    domain: rekberDomain,
    types: FUND_TYPES,
    primaryType: "Fund",
    message: args,
    address: args.buyer,
    signature: args.sig,
  });
  if (!valid) fail("Tanda tangan Fund bukan dari pembeli");
  return args.buyer;
}

export async function verifyAct(args: {
  dealId: Hex;
  action: number;
  data: Hex;
  deadline: bigint;
  sig: Hex;
  signer: Address;
}): Promise<Address> {
  const valid = await verifyTypedData({
    domain: rekberDomain,
    types: ACT_TYPES,
    primaryType: "Act",
    message: args,
    address: args.signer,
    signature: args.sig,
  });
  if (!valid) fail("Tanda tangan tidak valid — coba ulangi");
  return args.signer;
}

/** Tanggapan penjual (§3.6 respond) TIDAK pakai typed data — cukup signMessage biasa atas
 * responseHash mentah (off-chain saja, tidak ada tx, jadi tidak perlu terikat domain kontrak). */
export async function verifySellerResponse(args: { responseHash: Hex; seller: Address; sig: Hex }): Promise<Address> {
  const valid = await verifyMessage({
    address: args.seller,
    message: { raw: args.responseHash },
    signature: args.sig,
  });
  if (!valid) fail("Tanda tangan tanggapan bukan dari penjual");
  return args.seller;
}
