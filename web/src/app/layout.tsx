import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans, Libre_Baskerville } from "next/font/google";
import "./globals.css";

const serif = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-serif" });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Rekber AI — rekber tanpa admin",
  description: "Uang dikunci di smart contract, sengketa diputus AI. Tidak ada admin yang bisa kabur membawa uangmu.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#14202e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <header className="header">
          <Link href="/" className="brand">
            <img src="/logo.svg" alt="" className="brand-mark" />
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
