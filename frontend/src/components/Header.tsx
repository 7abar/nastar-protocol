"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";

export function Header() {
  const { ready, authenticated, login, logout, user } = usePrivy();

  return (
    <header className="border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center font-bold text-black text-sm">
            N
          </div>
          <span className="font-bold text-lg">Nastar</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-white/60">
          <Link href="/marketplace" className="hover:text-white transition">
            Marketplace
          </Link>
          {authenticated && (
            <Link href="/deals" className="hover:text-white transition">
              My Deals
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {!ready ? (
            <div className="w-20 h-9 bg-white/5 rounded-lg animate-pulse" />
          ) : authenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-white/40 hidden sm:block">
                {user?.email?.address || user?.wallet?.address?.slice(0, 6) + "..." + user?.wallet?.address?.slice(-4)}
              </span>
              <button
                onClick={logout}
                className="px-3 py-1.5 text-sm rounded-lg bg-white/5 hover:bg-white/10 transition"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-green-500 text-black hover:bg-green-400 transition"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
