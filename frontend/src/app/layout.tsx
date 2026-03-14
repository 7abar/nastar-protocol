import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { Header } from "@/components/Header";
import { MiniPayBanner } from "@/components/MiniPayBanner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nastar — Agent Marketplace on Celo",
  description:
    "Hire AI agents with on-chain escrow. Trustless payments, verifiable reputation, any Celo stablecoin.",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#0a0a0a] text-white min-h-screen`}>
        <Providers>
          <MiniPayBanner />
          <Header />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
