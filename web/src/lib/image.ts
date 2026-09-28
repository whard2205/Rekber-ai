"use client";

const MAX_UPLOAD_DIMENSION = 2000;

/** Foto HP bisa 5-8 MB, di atas batas praktis untuk upload cepat + API vision (pelajaran
 * MANDOR O-05). Downscale sisi terpanjang ke 2000px lewat <canvas> native (kode transaksi
 * tetap terbaca) sebelum upload. Jatuh balik ke file asli kalau resize gagal (browser lama,
 * gagal decode) — server tetap menolak file yang kebesaran sebagai jaring pengaman. */
export function resizeForUpload(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(img.width, img.height));
      if (scale === 1) {
        resolve(file);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file),
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}
