"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { celoSepoliaCustom } from "./contracts";
import { type ReactNode, useState, useEffect } from "react";
import { isMiniPay } from "./minipay";

const wagmiConfig = createConfig({
  chains: [celoSepoliaCustom],
  connectors: [
    // Support MiniPay's injected provider
    injected({ target: "metaMask" }),
  ],
  transports: {
    [celoSepoliaCustom.id]: http(),
  },
});

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);
  const [miniPayDetected, setMiniPayDetected] = useState(false);

  useEffect(() => {
    setMounted(true);
    setMiniPayDetected(isMiniPay());
  }, []);

  // Don't render Privy at all during SSR/prerender
  if (!mounted) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#F4C430",
        },
        loginMethods: miniPayDetected
          ? ["wallet"] // MiniPay: only show wallet connect (uses injected provider)
          : ["email", "wallet", "google"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: miniPayDetected ? "off" : "users-without-wallets",
          },
        },
        defaultChain: celoSepoliaCustom,
        supportedChains: [celoSepoliaCustom],

      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
