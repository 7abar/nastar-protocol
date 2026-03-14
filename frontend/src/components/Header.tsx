"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header() {
  const { authenticated, login, logout, user } = usePrivy();
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/offerings", label: "Offerings" },
    { href: "/agents", label: "Agents" },
    { href: "/bounties", label: "Bounties" },
    { href: "/faq", label: "FAQ" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-16">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-green-400 font-bold text-xl">Nastar</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg transition ${
                pathname === item.href
                  ? "text-green-400 bg-green-500/10"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/chat"
            className="ml-2 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition font-medium"
          >
            Chat
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {authenticated ? (
            <>
              <Link
                href="/deals"
                className="text-white/50 hover:text-white text-sm transition"
              >
                My Deals
              </Link>
              <button
                onClick={logout}
                className="text-white/30 hover:text-white text-sm transition"
              >
                {user?.email?.address?.slice(0, 12) || "Sign Out"}
              </button>
            </>
          ) : (
            <button
              onClick={login}
              className="px-4 py-1.5 rounded-lg bg-green-500 text-black text-sm font-medium hover:bg-green-400 transition"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
