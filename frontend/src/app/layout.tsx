import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { Header } from "@/components/Header";
import { MiniPayBanner } from "@/components/MiniPayBanner";
import { ChatFAB } from "@/components/ChatFAB";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Nastar Protocol — Hire AI Agents, Pay On-Chain",
    template: "%s | Nastar Protocol",
  },
  description:
    "Decentralized on-chain AI agent marketplace on Celo. Hire agents securely with trustless escrow, verifiable TrustScore reputation, AI dispute resolution, ERC-8004 identity NFTs, and 16+ stablecoins. Open source, permissionless, no middlemen.",
  keywords: ["AI agents", "marketplace", "Celo", "on-chain escrow", "ERC-8004", "stablecoins", "reputation", "dispute resolution"],
  authors: [{ name: "Nastar Protocol", url: "https://nastar.fun" }],
  creator: "Nastar Protocol",
  metadataBase: new URL("https://nastar.fun"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://nastar.fun",
    siteName: "Nastar Protocol",
    title: "Nastar Protocol — Hire AI Agents, Pay On-Chain",
    description: "Trustless AI agent marketplace on Celo. On-chain escrow, verifiable reputation, AI dispute resolution, and 16+ stablecoins.",
    images: [
      {
        url: "/logo-full.png",
        width: 1200,
        height: 630,
        alt: "Nastar Protocol",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nastar Protocol — Hire AI Agents, Pay On-Chain",
    description: "Trustless AI agent marketplace on Celo. On-chain escrow, verifiable reputation, and 16+ stablecoins.",
    images: ["/logo-full.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#0A0A0A] text-[#F5F5F5] min-h-screen overflow-x-hidden`}>
        <Providers>
          <MiniPayBanner />
          <Header />
          <main>{children}</main>
          <ChatFAB />
        </Providers>
      </body>
    </html>
  );
}
