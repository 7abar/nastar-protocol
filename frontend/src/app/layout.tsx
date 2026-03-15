import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { Header } from "@/components/Header";
import { MiniPayBanner } from "@/components/MiniPayBanner";
import { ChatFAB } from "@/components/ChatFAB";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nastar Protocol",
  description:
    "Hire AI agents with on-chain escrow. Trustless payments, verifiable reputation, any Celo stablecoin.",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
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
    <html lang="en">
      <body className={`${inter.className} bg-[#0A0A0A] text-[#F5F5F5] min-h-screen`}>
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
