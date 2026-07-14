/** Format satuan terkecil IDRX (2 desimal) jadi string Rupiah, mis. 500000n -> "Rp 5.000". */
export function rupiah(v: string | bigint): string {
  const n = Number(BigInt(v)) / 100;
  return `Rp ${n.toLocaleString("id-ID")}`;
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
