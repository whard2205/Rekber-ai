# Video demo Rekber AI (Remotion)

Video demo ±3 menit dari rekaman layar laptop (penjual) dan HP (pembeli).

## Buka dan edit

```bash
cd video
npm install
node scripts/make-sfx.mjs      # bikin pad.wav + whoosh.wav (sekali saja)
npm run studio                 # buka editor di browser, preview langsung
npm run render                 # hasil: out/rekber-ai-demo.mp4
```

Rekaman tidak ada di repo (ukurannya besar dan berisi data pribadi). Taruh di `public/footage/`
dengan nama `seller-HHMMSS.mov` (rekaman laptop) dan `buyer-HHMMSS.mp4` (rekaman HP).

## Yang paling sering diubah: `src/edl.ts`

Satu daftar adegan, urut dari awal ke akhir. Untuk potongan rekaman:

- `from` / `to`: detik di file sumber
- `speed`: kecepatan putar (2 = dua kali lebih cepat)
- `title` / `body`: teks di samping rekaman, `highlight`: indeks kata yang diberi warna amber
- `crop`: area yang diambil dari rekaman (laptop dipotong ke kolom halaman web supaya tab browser tidak ikut)

Durasi adegan dihitung otomatis. Ubah urutan dengan memindah baris; hapus adegan dengan menghapus barisnya.

Teks kartu pembuka, hook, diagram, angka, dan penutup ada di `src/scenes/Cards.tsx`.
Warna, font, dan kecepatan animasi ada di `src/theme.ts`.

## Alat bantu memilih potongan

```bash
# grid cuplikan satu klip di detik tertentu
npx remotion still src/index.ts Sheet out/sheet.png --props='{"src":"footage/buyer-210125.mp4","times":[0,8,16,24],"cols":4}'
# satu frame penuh dengan garis koordinat (untuk menentukan crop)
npx remotion still src/index.ts Peek out/peek.png --props='{"src":"footage/seller-204740.mov","t":45}'
```
