import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "MANDOR — Kerja untuk AI",
  description: "Selesaikan tugas dari AI agent, dibayar IDRX instan.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ff6a3d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <header className="header">
          <Link href="/" className="brand">
            <span className="brand-mark">⛑️</span>
            MANDOR
          </Link>
          <nav className="nav">
            <Link href="/">Kerjaan</Link>
            <Link href="/riwayat">Riwayat</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
