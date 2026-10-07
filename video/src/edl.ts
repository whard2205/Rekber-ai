// EDIT DI SINI. Daftar adegan video, urut dari awal ke akhir.
// Potongan rekaman: from/to = detik di file sumber, speed = kecepatan putar (2 = dua kali lebih cepat).
// Durasi adegan potongan dihitung otomatis: (to - from) / speed. Adegan kartu pakai `seconds`.
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
  speed: number;
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
  { type: "title", seconds: 5 },
  { type: "hook", seconds: 8 },
  { type: "idea", seconds: 6 },

  { type: "chapter", seconds: 3, kicker: "Transaksi 1", title: "Jual beli lancar" },
  {
    type: "clip", kind: "laptop", src: seller("seller-203520"), from: 0, to: 5, speed: 1, crop: WEB_COLUMN, source: LAPTOP,
    label: "Penjual, di laptop", step: "1", title: "Penjual bikin transaksi", body: "Harga dan janji barang ditandatangani. Dapat link dan kode unik.", highlight: [3],
  },
  {
    type: "clip", kind: "phone", src: buyer("buyer-204333a"), from: 8, to: 23, speed: 1.5, crop: PHONE_FULL, source: PHONE,
    label: "Pembeli, di HP", step: "2", title: "Pembeli buka link dan bayar", body: "Uang dikunci di smart contract. Tanpa install wallet, tanpa bayar gas.", highlight: [5],
  },
  {
    type: "clip", kind: "laptop", src: seller("seller-204030"), from: 2, to: 26, speed: 2, crop: WEB_COLUMN, source: LAPTOP,
    label: "Penjual, di laptop", step: "3", title: "Penjual kirim dengan bukti", body: "Foto barang di samping kode transaksi, plus nomor resi.", highlight: [3],
  },
  {
    type: "clip", kind: "phone", src: buyer("buyer-204333b"), from: 28, to: 42, speed: 1.4, crop: PHONE_SMALL_FULL, source: PHONE_SMALL,
    label: "Pembeli, di HP", step: "4", title: "Pembeli konfirmasi, uang cair", body: "Langsung dari kontrak ke wallet penjual, dipotong fee 1%.", highlight: [3],
  },
  {
    type: "clip", kind: "phone", src: buyer("buyer-204333b"), from: 12, to: 20, speed: 1, crop: PHONE_SMALL_FULL, source: PHONE_SMALL,
    label: "Pembeli, di HP", title: "Semua tercatat di blockchain", body: "Setiap langkah punya transaksi yang bisa dicek di BscScan.", highlight: [3],
  },

  { type: "chapter", seconds: 3, kicker: "Transaksi 2", title: "Yang datang bukan HP" },
  {
    type: "clip", kind: "laptop", src: seller("seller-204740"), from: 10, to: 56, speed: 3, crop: WEB_COLUMN, source: LAPTOP,
    label: "Penjual, di laptop", step: "1", title: "AI menyusun janji penjual", body: "Deskripsi jadi daftar poin yang bisa dicek dari foto nanti.", highlight: [1],
  },
  {
    type: "clip", kind: "laptop", src: seller("seller-205315"), from: 12, to: 30, speed: 2, crop: WEB_COLUMN, source: LAPTOP,
    label: "Penjual, di laptop", step: "2", title: "Bukti kirimnya cuma dus tertutup", body: "Barangnya tidak kelihatan di foto packing.", highlight: [4],
  },
  {
    type: "clip", kind: "phone", src: buyer("buyer-210125"), from: 8, to: 52, speed: 2.5, crop: PHONE_FULL, source: PHONE,
    label: "Pembeli, di HP", step: "3", title: "Isinya botol lotion", body: "Pembeli foto unboxing dengan kode transaksi, lalu komplain.", highlight: [2],
  },
  {
    type: "clip", kind: "laptop", src: seller("seller-205554"), from: 15, to: 47, speed: 4, crop: WEB_COLUMN, source: LAPTOP,
    label: "Penjual, di laptop", step: "4", title: "Penjual boleh menanggapi", body: "AI membaca bukti kedua pihak, bukan cuma keluhannya.", highlight: [3],
  },
  {
    type: "clip", kind: "phone", src: buyer("buyer-210135"), from: 0, to: 13, speed: 1, crop: PHONE_FULL, source: PHONE,
    label: "Pembeli, di HP", step: "5", title: "AI memutus: refund", body: "Alasannya ditulis, dan hash putusannya disimpan di blockchain.", highlight: [2],
  },
  {
    type: "clip", kind: "phone", src: buyer("buyer-210135"), from: 26, to: 35, speed: 1, crop: PHONE_FULL, source: PHONE,
    label: "Pembeli, di HP", title: "Siapa pun bisa mengecek", body: "Putusan ini sama persis dengan yang tercatat di blockchain.", highlight: [3],
  },
  {
    type: "clip", kind: "laptop", src: seller("seller-212107"), from: 14, to: 21, speed: 1, crop: WEB_COLUMN, source: LAPTOP,
    label: "Halaman transaksi", title: "Uang kembali utuh ke pembeli", body: "Tanpa potongan. Penjual tidak bisa menahan atau menariknya.", highlight: [1],
  },
  {
    type: "clip", kind: "wide", src: seller("seller-205924"), from: 44, to: 51, speed: 1, crop: WEB_WIDE, source: LAPTOP,
    label: "Layar panggung", title: "Feed keputusan AI", body: "Setiap putusan tampil terbuka.", highlight: [2],
  },

  { type: "diagram", seconds: 9 },
  { type: "stats", seconds: 6 },
  { type: "close", seconds: 8 },
];

export const sceneFrames = (s: Scene, fps: number): number =>
  Math.round((s.type === "clip" ? (s.to - s.from) / s.speed : s.seconds) * fps);
