// Tipe bersama untuk deal Rekber AI — dibaca dari data/deals/<dealCode>.json (web menulis,
// agent hanya baca+tambah verdict). Field & urutan key mengikuti docs/rekber-ai/PLAN.md §3.3
// persis — jangan diubah tanpa mengubah dokumen itu juga (hash dihitung dari JSON.stringify
// objek-objek ini, urutan key ikut menentukan hash).

export interface Spec {
  dealCode: string;
  seller: string;
  title: string;
  /** Rupiah utuh sebagai string (token 0 desimal): "8500000" = Rp8.500.000. */
  priceIDRX: string;
  description: string;
  checklist: string[];
  listingPhotos: string[];
}

export interface ShipmentEvidence {
  packingPhotos: string[];
  resiPhoto: string | null;
  resiText: string;
  shipmentHash: string;
  submittedAt: string;
}

export interface DisputeEvidence {
  photos: string[];
  complaint: string;
  disputeHash: string;
  submittedAt: string;
}

export interface SellerResponseEvidence {
  photos: string[];
  text: string;
  responseHash: string;
  respondedAt: string;
}

export interface DealRecord {
  dealCode: string;
  dealId: string;
  createdAt: string;
  seller: string;
  spec: Spec;
  specHash: string;
  offer: { deadline: number; sig: string };
  shipment?: ShipmentEvidence;
  dispute?: DisputeEvidence;
  sellerResponse?: SellerResponseEvidence;
  txs: { fund?: string; ship?: string; confirm?: string; dispute?: string };
}

/** Satu foto bukti + label teks yang mendahuluinya saat dikirim ke model vision
 * (mis. "Foto 3 — packing dari penjual") — supaya model tahu peran tiap foto. */
export interface ImageInput {
  label: string;
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}
