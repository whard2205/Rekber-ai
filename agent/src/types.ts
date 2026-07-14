// Spec task manusia yang dihasilkan brain dan diposting ke escrow.
export interface HumanTaskSpec {
  title: string;
  // Instruksi untuk worker, bahasa Indonesia, cukup jelas untuk orang awam
  instructions: string;
  acceptanceCriteria: string[];
  // Upah dalam satuan terkecil IDRX (2 desimal): 500000 = Rp 5.000,00
  bountyIDRX: number;
  // Kode tantangan anti-cheat, dibuat agent (bukan model) saat posting.
  // Ikut masuk specHash on-chain sehingga tamper-evident. Worker wajib
  // menampilkan kode ini di dalam foto bukti.
  challenge: string;
}

export interface ProofImage {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}
