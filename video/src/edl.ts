// EDIT DI SINI. Daftar adegan video, urut dari awal ke akhir.
// Potongan rekaman: from/to = detik di file sumber, seconds = lama adegan di video.
// Kecepatan putar dihitung otomatis: (to - from) / seconds. Jaga di bawah ~3 supaya layar terbaca.
// Durasi `seconds` saat ini mengikuti narasi (public/voice.wav): adegan ke-n mulai tepat saat
// paragraf ke-n di NARASI.md mulai diucapkan. Ubah durasi = ubah sinkronisasi dengan suara.
// Teks di layar sengaja tanpa tanda hubung, garis panjang, atau titik tengah.

export type Crop = { x: number; y: number; w: number; h: number };

const LAPTOP = { w: 2940, h: 1912 };
const PHONE = { w: 576, h: 1248 };
const PHONE_SMALL = { w: 384, h: 832 };
// Kolom halaman web di rekaman laptop (tab & bookmark browser dibuang).
const WEB_COLUMN: Crop = { x: 980, y: 215, w: 1000, h: 1634 };
// Halaman /panggung memakai lebar penuh.
const WEB_WIDE: Crop = { x: 0, y: 215, w: 2940, h: 1470 };
const PHONE_FULL: Crop = { x: 0, y: 0, w: 576, h: 1248 };
const PHONE_SMALL_FULL: Crop = { x: 0, y: 0, w: 384, h: 832 };

export type ClipScene = {
  type: "clip";
  kind: "laptop" | "phone" | "wide";
  src: string;
  from: number;
  to: number;
  /** Lama adegan di video. Kecepatan putar = (to - from) / seconds. */
  seconds: number;
  crop: Crop;
  source: { w: number; h: number };
  label: string;
  step?: string;
  title: string;
  body: string;
  highlight?: number[];
};

export type CardScene =
  | { type: "title"; seconds: number }
  | { type: "hook"; seconds: number }
  | { type: "idea"; seconds: number }
  | { type: "chapter"; seconds: number; kicker: string; title: string }
  | { type: "diagram"; seconds: number }
  | { type: "stats"; seconds: number }
  | { type: "close"; seconds: number };

export type Scene = ClipScene | CardScene;

const seller = (file: string) => `footage/${file}.mov`;
const buyer = (file: string) => `footage/${file}.mp4`;

export const SCENES: Scene[] = [
  { type: "title", seconds: 8.04 },
  { type: "hook", seconds: 12 },
  { type: "idea", seconds: 9.84 },

  { type: "chapter", seconds: 3.04, kicker: "Transaksi 1", title: "Jual beli lancar" },
  {
    type: "clip", kind: "laptop", src: seller("seller-203520"), from: 0, to: 5, seconds: 3.44, crop: WEB_COLUMN, source: LAPTOP,
    label: "Penjual, di laptop", step: "1", title: "Penjual bikin transaksi", body: "Harga dan janji barang ditandatangani. Dapat link dan kode unik.", highlight: [3],
  },
  {
    type: "clip", kind: "phone", src: buyer("buyer-204333a"), from: 8, to: 23, seconds: 6.98, crop: PHONE_FULL, source: PHONE,
    label: "Pembeli, di HP", step: "2", title: "Pembeli buka link dan bayar", body: "Uang dikunci di smart contract. Tanpa install wallet, tanpa bayar gas.", highlight: [5],
  },
  {
    type: "clip", kind: "laptop", src: seller("seller-204030"), from: 6, to: 23, seconds: 5.5, crop: WEB_COLUMN, source: LAPTOP,
    label: "Penjual, di laptop", step: "3", title: "Penjual kirim dengan bukti", body: "Foto barang di samping kode transaksi, plus nomor resi.", highlight: [3],
  },
  {
    type: "clip", kind: "phone", src: buyer("buyer-204333b"), from: 28, to: 42, seconds: 5.4, crop: PHONE_SMALL_FULL, source: PHONE_SMALL,
    label: "Pembeli, di HP", step: "4", title: "Pembeli konfirmasi, uang cair", body: "Langsung dari kontrak ke wallet penjual, dipotong fee 1%.", highlight: [3],
  },
  {
    type: "clip", kind: "phone", src: buyer("buyer-204333b"), from: 12, to: 20, seconds: 4.74, crop: PHONE_SMALL_FULL, source: PHONE_SMALL,
    label: "Pembeli, di HP", title: "Semua tercatat di blockchain", body: "Setiap langkah punya transaksi yang bisa dicek di BscScan.", highlight: [3],
  },

  { type: "chapter", seconds: 5.44, kicker: "Transaksi 2", title: "Yang datang bukan HP" },
  {
    type: "clip", kind: "laptop", src: seller("seller-204740"), from: 36, to: 56, seconds: 6.64, crop: WEB_COLUMN, source: LAPTOP,
    label: "Penjual, di laptop", step: "1", title: "AI menyusun janji penjual", body: "Deskripsi jadi daftar poin yang bisa dicek dari foto nanti.", highlight: [1],
  },
  {
    type: "clip", kind: "laptop", src: seller("seller-205315"), from: 16, to: 30, seconds: 4.68, crop: WEB_COLUMN, source: LAPTOP,
    label: "Penjual, di laptop", step: "2", title: "Bukti kirimnya cuma dus tertutup", body: "Barangnya tidak kelihatan di foto packing.", highlight: [4],
  },
  {
    type: "clip", kind: "phone", src: buyer("buyer-210125"), from: 14, to: 42, seconds: 9.52, crop: PHONE_FULL, source: PHONE,
    label: "Pembeli, di HP", step: "3", title: "Isinya botol lotion", body: "Pembeli foto unboxing dengan kode transaksi, lalu komplain.", highlight: [2],
  },
  {
    type: "clip", kind: "laptop", src: seller("seller-205554"), from: 38, to: 46, seconds: 2.6, crop: WEB_COLUMN, source: LAPTOP,
    label: "Penjual, di laptop", step: "4", title: "Penjual boleh menanggapi", body: "AI membaca bukti kedua pihak, bukan cuma keluhannya.", highlight: [3],
  },
  {
    type: "clip", kind: "phone", src: buyer("buyer-210135"), from: 0, to: 13, seconds: 6.52, crop: PHONE_FULL, source: PHONE,
    label: "Pembeli, di HP", step: "5", title: "AI memutus: refund", body: "Alasannya ditulis, dan hash putusannya disimpan di blockchain.", highlight: [2],
  },
  {
    type: "clip", kind: "phone", src: buyer("buyer-210135"), from: 26, to: 35, seconds: 3.96, crop: PHONE_FULL, source: PHONE,
    label: "Pembeli, di HP", title: "Siapa pun bisa mengecek", body: "Putusan ini sama persis dengan yang tercatat di blockchain.", highlight: [3],
  },
  {
    type: "clip", kind: "laptop", src: seller("seller-212107"), from: 14, to: 21, seconds: 2.6, crop: WEB_COLUMN, source: LAPTOP,
    label: "Halaman transaksi", title: "Uang kembali utuh ke pembeli", body: "Tanpa potongan. Penjual tidak bisa menahan atau menariknya.", highlight: [1],
  },
  {
    type: "clip", kind: "wide", src: seller("seller-205924"), from: 44, to: 51, seconds: 2.6, crop: WEB_WIDE, source: LAPTOP,
    label: "Layar panggung", title: "Feed keputusan AI", body: "Setiap putusan tampil terbuka.", highlight: [2],
  },

  { type: "diagram", seconds: 10.64 },
  { type: "stats", seconds: 5.64 },
  { type: "close", seconds: 14.4 },
];

export const sceneFrames = (s: Scene, fps: number): number => Math.round(s.seconds * fps);
export const clipSpeed = (s: ClipScene): number => (s.to - s.from) / s.seconds;

// Narasi: satu file utuh. `trimStart` = detik di file suara yang jatuh di frame 0 video.
export const NARRATION = { src: "voice.wav", trimStart: 0.4, volume: 1.15 };
