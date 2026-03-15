"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";

export function ChatFAB() {
  const { authenticated, login } = usePrivy();
  const router = useRouter();
  const pathname = usePathname();

  // Hide on /chat page itself
  if (pathname === "/chat" || pathname?.startsWith("/chat/")) return null;

  function handleClick() {
    if (!authenticated) {
      login();
      return;
    }
    router.push("/chat");
  }

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full shadow-[0_4px_24px_rgba(244,196,48,0.4)] hover:shadow-[0_4px_32px_rgba(244,196,48,0.6)] hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center group overflow-hidden"
      aria-label="Chat with Nastar"
    >
      <Image
        src="/nastar-mascot.png"
        alt="Nastar"
        width={64}
        height={64}
        className="w-full h-full object-cover rounded-full"
      />

      {/* Tooltip */}
      <span className="absolute right-[72px] bg-[#1A1A1A] text-[#F5F5F5] text-xs px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10">
        Chat with Nastar
      </span>
    </button>
  );
}
