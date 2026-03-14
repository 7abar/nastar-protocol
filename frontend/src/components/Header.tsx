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
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-[#1A1A1A] border border-[#F4C430]/20 shadow-2xl z-50 overflow-hidden">
          {/* Wallet header */}
          <div className="p-4 bg-[#111] border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#F4C430] text-[#0A0A0A] text-sm font-bold flex items-center justify-center">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="flex items-center gap-2 text-[#F5F5F5] font-mono text-sm hover:text-[#F4C430] transition"
                >
                  {shortAddr}
                  <svg className="w-3.5 h-3.5 text-[#A1A1A1]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {copied && <span className="text-[#F4C430] text-[10px]">Copied!</span>}
                </button>
                {email && <p className="text-[#A1A1A1]/50 text-xs truncate mt-0.5">{email}</p>}
              </div>
            </div>

            {/* Network badge */}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                <span className="w-2 h-2 rounded-full bg-[#F4C430]" />
                <span className="text-[#A1A1A1] text-xs">Celo Sepolia</span>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <Link href="/deals" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[#F5F5F5] hover:bg-white/[0.04] transition">
              <svg className="w-4 h-4 text-[#A1A1A1]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 3.75h1.5a2.251 2.251 0 011.6.664" />
              </svg>
              <span className="text-sm">My Deals</span>
            </Link>
            <Link href="/agents" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[#F5F5F5] hover:bg-white/[0.04] transition">
              <svg className="w-4 h-4 text-[#A1A1A1]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              <span className="text-sm">My Agents</span>
            </Link>
            <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[#F5F5F5] hover:bg-white/[0.04] transition">
              <svg className="w-4 h-4 text-[#A1A1A1]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm">Account Settings</span>
            </Link>
          </div>

          <div className="border-t border-white/[0.06] py-1">
            <a
              href={address ? `https://sepolia.celoscan.io/address/${address}` : "#"}
              target="_blank"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-[#A1A1A1] hover:bg-white/[0.04] transition"
            >
              <svg className="w-4 h-4 text-[#A1A1A1]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              <span className="text-sm">CeloScan</span>
            </a>
          </div>

          <div className="border-t border-white/[0.06]">
            <button
              onClick={() => { setOpen(false); logout(); }}
              className="flex items-center gap-3 w-full px-4 py-3 text-red-400 hover:bg-red-500/5 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              <span className="text-sm">Logout</span>
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
        <Link href="/" className="flex items-center gap-2">
          <span className="font-bold text-[#F5F5F5] text-lg">Nastar</span>
          <span className="text-[#A1A1A1] text-xs hidden sm:inline">Agent Marketplace</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                pathname === item.href ? "text-[#F4C430] font-medium" : "text-[#A1A1A1] hover:text-[#F5F5F5]"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <Link href="/chat" className="ml-2 px-3 py-1.5 rounded-lg text-sm font-medium text-[#F4C430] hover:bg-[#F4C430]/10 transition">
            Chat
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {authenticated ? (
            <ProfileDropdown />
          ) : (
            <button onClick={login} className="px-4 py-1.5 rounded-full gradient-btn text-sm font-bold hover:shadow-[0_0_20px_rgba(244,196,48,0.4)] transition">
              Connect
            </button>
          )}

          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-[#A1A1A1] hover:text-[#F4C430]">
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

      {mobileOpen && (
        <nav className="md:hidden border-t border-[#F4C430]/20 bg-[#0A0A0A]">
          <div className="px-4 py-2 space-y-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2.5 rounded-lg text-sm ${pathname === item.href ? "text-[#F4C430] font-medium bg-[#F4C430]/10" : "text-[#A1A1A1]"}`}>
                {item.label}
              </Link>
            ))}
            <Link href="/chat" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-[#F4C430]">Chat</Link>
          </div>
        </nav>
      )}
    </header>
  );
}
