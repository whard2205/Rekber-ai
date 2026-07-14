/** Format satuan terkecil IDRX (2 desimal) jadi string Rupiah, mis. 500000n -> "Rp 5.000". */
export function rupiah(v: string | bigint): string {
  const n = Number(BigInt(v)) / 100;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
