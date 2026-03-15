"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

function ProfileDropdown() {
  const { logout, user } = usePrivy();
  const { wallets } = useWallets();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const address = wallets[0]?.address || "";
  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
  const email = user?.email?.address || "";
  const initials = address ? address.slice(2, 4).toUpperCase() : "?";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-[#F4C430] text-[#0A0A0A] text-xs font-bold flex items-center justify-center hover:shadow-[0_0_15px_#F4C430] transition"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#141414] border border-white/[0.08] shadow-2xl z-50 overflow-hidden">
          {/* Wallet info */}
          <div className="px-4 py-3.5 border-b border-white/[0.06]">
            <button
              onClick={() => { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="flex items-center gap-2 text-[#F5F5F5] font-mono text-sm hover:text-[#F4C430] transition w-full"
            >
              <div className="w-7 h-7 rounded-full bg-[#F4C430] text-[#0A0A0A] text-xs font-bold flex items-center justify-center flex-shrink-0">
                {initials}
              </div>
              <span className="flex-1 text-left">{shortAddr}</span>
              {copied
                ? <span className="text-[#F4C430] text-[10px]">Copied!</span>
                : <svg className="w-3.5 h-3.5 text-[#A1A1A1]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              }
            </button>
            {email && <p className="text-[#A1A1A1]/40 text-[11px] mt-1.5 pl-9 truncate">{email}</p>}
            <div className="flex items-center gap-1.5 mt-2 pl-9">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F4C430]" />
              <span className="text-[#A1A1A1]/40 text-[11px]">Celo Sepolia</span>
            </div>
          </div>

          {/* Nav — Profile, Settings, Logout only */}
          <div className="py-1.5">
            <Link href={`/profile/${address}`} onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-[#A1A1A1] hover:text-[#F5F5F5] hover:bg-white/[0.03] transition text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Profile
            </Link>
            <Link href="/settings" onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-[#A1A1A1] hover:text-[#F5F5F5] hover:bg-white/[0.03] transition text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </Link>
          </div>

          <div className="border-t border-white/[0.06] py-1.5">
            <button onClick={() => { setOpen(false); logout(); }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-red-400/70 hover:text-red-400 hover:bg-red-500/5 transition text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { authenticated, login } = usePrivy();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Only 3 primary nav items — everything else is in the profile dropdown or accessible from homepage
  const navItems = [
    { href: "/offerings", label: "Browse" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/launch", label: "Launch" },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#0A0A0A]/95 backdrop-blur-md border-b border-white/[0.06]">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 md:px-6 h-14">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
          <span className="font-bold text-[#F5F5F5] text-base tracking-tight">Nastar</span>
          <span className="hidden sm:inline text-[#A1A1A1]/40 text-xs">·</span>
          <span className="hidden sm:inline text-[#A1A1A1]/40 text-xs">Agent Marketplace</span>
        </Link>

        {/* Primary nav — minimal */}
        <nav className="hidden md:flex items-center gap-0.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                pathname === item.href
                  ? "text-[#F5F5F5] font-medium"
                  : "text-[#A1A1A1]/60 hover:text-[#F5F5F5]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {authenticated ? (
            <>
              {/* Quick Launch pill */}
              <Link href="/launch"
                className="hidden md:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#F4C430] text-[#0A0A0A] text-xs font-bold hover:shadow-[0_0_20px_rgba(244,196,48,0.4)] transition">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
                </svg>
                Launch
              </Link>
              <ProfileDropdown />
            </>
          ) : (
            <button onClick={login}
              className="px-4 py-1.5 rounded-full bg-[#F4C430] text-[#0A0A0A] text-sm font-bold hover:shadow-[0_0_20px_rgba(244,196,48,0.4)] transition">
              Connect
            </button>
          )}

          {/* Mobile menu toggle */}
          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-[#A1A1A1]/60 hover:text-[#F5F5F5] transition">
            {mobileOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-white/[0.06] bg-[#0A0A0A]">
          <div className="px-4 py-3 space-y-0.5">
            {[
              { href: "/", label: "Home" },
              { href: "/offerings", label: "Browse Agents" },
              { href: "/leaderboard", label: "Leaderboard" },
              { href: "/launch", label: "Launch Agent" },
              { href: "/settings", label: "Settings" },
            ].map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2.5 rounded-lg text-sm transition ${
                  pathname === item.href ? "text-[#F4C430] font-medium bg-[#F4C430]/5" : "text-[#A1A1A1]/70 hover:text-[#F5F5F5]"
                }`}>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
