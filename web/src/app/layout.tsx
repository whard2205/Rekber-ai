import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rekber AI — Escrow non-custodial dengan AI sebagai hakim",
  description: "Bayar aman jual-beli online: dana dikunci di kontrak, AI memutus sengketa.",
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
            <span className="brand-mark">⚖️</span>
            Rekber AI
          </Link>
          <nav className="nav">
            <Link href="/jual">Jualan</Link>
            <Link href="/panggung">Panggung</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
