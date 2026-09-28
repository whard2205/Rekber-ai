/** Format satuan terkecil IDRX (token 0 desimal, 1 unit = Rp1) jadi string Rupiah,
 * mis. 8500000n -> "Rp 8.500.000". */
export function rupiah(v: string | bigint): string {
  return `Rp ${BigInt(v).toLocaleString("id-ID")}`;
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** URL explorer untuk tx hash, atau null bila explorer tidak dikonfigurasi (mis. localhost). */
export function explorerTxUrl(txHash: string): string | null {
  const base = process.env.NEXT_PUBLIC_EXPLORER_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string | null {
  const base = process.env.NEXT_PUBLIC_EXPLORER_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/address/${address}`;
}
