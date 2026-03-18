"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { celoSepoliaCustom } from "./contracts";
import { type ReactNode, useState } from "react";

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

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#F4C430",
        },
        // Support both regular browsers and MiniPay wallet
        loginMethods: ["email", "wallet", "google"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
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
