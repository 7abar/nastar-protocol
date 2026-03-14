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
        {address ? address.slice(2, 4).toUpperCase() : "?"}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl glass-card shadow-lg z-50 overflow-hidden">
          <div className="p-4 border-b border-[#F4C430]/20">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#F4C430] text-[#0A0A0A] text-xs font-bold flex items-center justify-center">
                {address ? address.slice(2, 4).toUpperCase() : "?"}
              </div>
              <div className="min-w-0">
                <button
                  onClick={() => { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="text-[#F5F5F5] font-mono text-xs hover:text-[#F4C430] transition"
                >
                  {copied ? "Copied!" : shortAddr}
                </button>
                {email && <p className="text-[#A1A1A1] text-xs truncate">{email}</p>}
              </div>
            </div>
          </div>
          <div className="py-1">
            <Link href="/deals" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-[#A1A1A1] hover:text-[#F4C430] hover:bg-white/5 text-sm">
              My Deals
            </Link>
            <Link href="/agents" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-[#A1A1A1] hover:text-[#F4C430] hover:bg-white/5 text-sm">
              My Agents
            </Link>
            <a href={address ? `https://sepolia.celoscan.io/address/${address}` : "#"} target="_blank" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-[#A1A1A1] hover:text-[#F4C430] hover:bg-white/5 text-sm">
              CeloScan
            </a>
          </div>
          <div className="border-t border-[#F4C430]/20">
            <button onClick={() => { setOpen(false); logout(); }} className="block w-full text-left px-4 py-2.5 text-red-400 hover:bg-red-500/10 text-sm">
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

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/offerings", label: "Offerings" },
    { href: "/agents", label: "Agents" },
    { href: "/faq", label: "FAQ" },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#0A0A0A]/90 backdrop-blur-md border-b border-[#F4C430]/20">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="font-bold text-[#F5F5F5] text-lg">Nastar</span>
          <span className="text-[#A1A1A1] text-xs hidden sm:inline">Agent Marketplace</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                pathname === item.href
                  ? "text-[#F4C430] font-medium"
                  : "text-[#A1A1A1] hover:text-[#F5F5F5]"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/chat"
            className="ml-2 px-3 py-1.5 rounded-lg text-sm font-medium text-[#F4C430] hover:bg-[#F4C430]/10 transition"
          >
            Chat
          </Link>
        </nav>

        {/* Right */}
        <div className="flex items-center gap-2">
          {authenticated ? (
            <ProfileDropdown />
          ) : (
            <button
              onClick={login}
              className="px-4 py-1.5 rounded-full gradient-btn text-sm font-bold hover:shadow-[0_0_20px_rgba(244,196,48,0.4)] transition"
            >
              Connect
            </button>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-[#A1A1A1] hover:text-[#F4C430]"
          >
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

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-[#F4C430]/20 bg-[#0A0A0A]">
          <div className="px-4 py-2 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2.5 rounded-lg text-sm ${
                  pathname === item.href ? "text-[#F4C430] font-medium bg-[#F4C430]/10" : "text-[#A1A1A1]"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link href="/chat" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-[#F4C430]">
              Chat
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
