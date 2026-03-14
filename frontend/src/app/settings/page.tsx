"use client";

import { useState, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, http, formatUnits } from "viem";
import Link from "next/link";
import { celoSepoliaCustom, CONTRACTS, ESCROW_ABI, ERC8004_ABI } from "@/lib/contracts";
import { getStoredAgents, type RegisteredAgent } from "@/lib/agents-api";

const client = createPublicClient({ chain: celoSepoliaCustom, transport: http() });
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api-production-a473.up.railway.app";

const DEAL_STATUS: Record<number, string> = { 0: "Created", 1: "Accepted", 2: "Delivered", 3: "Completed", 4: "Disputed", 5: "Refunded", 6: "Expired", 7: "Resolved" };

interface SocialLink {
  platform: string;
  icon: string;
  username: string;
  connected: boolean;
  color: string;
  authUrl: string;
}

interface UserProfile {
  bio: string;
  socials: Record<string, string>;
}

function loadProfile(addr: string): UserProfile {
  try {
    const s = localStorage.getItem(`nastar-profile-${addr.toLowerCase()}`);
    if (s) return JSON.parse(s);
  } catch {}
  return { bio: "", socials: {} };
}
function saveProfile(addr: string, p: UserProfile) {
  localStorage.setItem(`nastar-profile-${addr.toLowerCase()}`, JSON.stringify(p));
}

export default function SettingsPage() {
  const { authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const [tab, setTab] = useState<"profile" | "agents" | "deals" | "wallets">("profile");
  const [profile, setProfile] = useState<UserProfile>({ bio: "", socials: {} });
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  // Deals
  const [deals, setDeals] = useState<any[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);

  // Agents
  const [agents, setAgents] = useState<RegisteredAgent[]>([]);
  const [onChainAgents, setOnChainAgents] = useState<any[]>([]);

  const address = wallets[0]?.address || "";
  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
  const email = user?.email?.address || "";

  useEffect(() => {
    if (address) setProfile(loadProfile(address));
  }, [address]);

  // Load deals when tab switches
  useEffect(() => {
    if (tab === "deals" && address && deals.length === 0) loadDeals();
    if (tab === "agents" && address) loadAgents();
  }, [tab, address]);

  async function loadDeals() {
    setDealsLoading(true);
    try {
      const nextId = await client.readContract({ address: CONTRACTS.NASTAR_ESCROW, abi: ESCROW_ABI, functionName: "nextDealId" }) as bigint;
      const addr = address.toLowerCase();
      const loaded: any[] = [];
      for (let i = 0n; i < nextId; i++) {
        try {
          const deal = await client.readContract({ address: CONTRACTS.NASTAR_ESCROW, abi: ESCROW_ABI, functionName: "getDeal", args: [i] }) as any;
          if (deal.buyer.toLowerCase() === addr || deal.seller.toLowerCase() === addr) loaded.push(deal);
        } catch {}
      }
      setDeals(loaded.reverse());
    } catch {}
    setDealsLoading(false);
  }

  async function loadAgents() {
    setAgents(getStoredAgents());
    try {
      const res = await fetch(`${API_URL}/v1/leaderboard`);
      const lb = await res.json();
      const mine = lb.filter((a: any) => a.address?.toLowerCase() === address.toLowerCase());
      setOnChainAgents(mine);
    } catch {}
  }

  function handleSave() {
    if (!address) return;
    saveProfile(address, profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleConnect(platform: string) {
    setConnecting(platform);
    // Simulate OAuth popup — in production would redirect to real OAuth
    const popup = window.open("", "_blank", "width=500,height=600");
    if (popup) {
      popup.document.write(`
        <html><head><title>Connect ${platform}</title>
        <style>body{background:#0A0A0A;color:#F5F5F5;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
        .card{text-align:center;padding:40px;border-radius:16px;border:1px solid rgba(244,196,48,0.2);background:#1A1A1A;max-width:360px}
        h2{margin:0 0 8px}p{color:#A1A1A1;font-size:14px;margin:0 0 24px}
        input{width:100%;padding:12px;border-radius:8px;border:1px solid #333;background:#111;color:#F5F5F5;font-size:14px;margin-bottom:12px;box-sizing:border-box}
        button{width:100%;padding:12px;border-radius:8px;border:none;background:linear-gradient(90deg,#F4C430,#FF9F1C);color:#0A0A0A;font-weight:bold;font-size:14px;cursor:pointer}
        button:hover{opacity:0.9}.icon{font-size:40px;margin-bottom:16px}</style></head>
        <body><div class="card">
        <div class="icon">${platform === "GitHub" ? "🐙" : platform === "Twitter" ? "🐦" : platform === "Telegram" ? "✈️" : "🌐"}</div>
        <h2>Connect ${platform}</h2>
        <p>Enter your ${platform} username to link it to your Nastar profile.</p>
        <input id="u" placeholder="@username" autofocus />
        <button onclick="window.opener.postMessage({platform:'${platform}',username:document.getElementById('u').value},'*');window.close()">Connect</button>
        </div></body></html>
      `);
    }
  }

  // Listen for OAuth callback
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.data?.platform && e.data?.username) {
        const username = e.data.username.replace(/^@/, "").trim();
        if (username) {
          const newProfile = { ...profile, socials: { ...profile.socials, [e.data.platform]: username } };
          setProfile(newProfile);
          if (address) saveProfile(address, newProfile);
        }
        setConnecting(null);
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [profile, address]);

  function handleDisconnect(platform: string) {
    const newSocials = { ...profile.socials };
    delete newSocials[platform];
    const newProfile = { ...profile, socials: newSocials };
    setProfile(newProfile);
    if (address) saveProfile(address, newProfile);
  }

  const socialPlatforms: SocialLink[] = [
    { platform: "GitHub", icon: "G", username: profile.socials.GitHub || "", connected: !!profile.socials.GitHub, color: "#333", authUrl: "https://github.com" },
    { platform: "Twitter", icon: "X", username: profile.socials.Twitter || "", connected: !!profile.socials.Twitter, color: "#1DA1F2", authUrl: "https://twitter.com" },
    { platform: "Telegram", icon: "T", username: profile.socials.Telegram || "", connected: !!profile.socials.Telegram, color: "#229ED9", authUrl: "https://t.me" },
  ];

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-bold text-[#F5F5F5] mb-2">Account Settings</h2>
          <p className="text-[#A1A1A1] text-sm mb-6">Connect your wallet to manage your account.</p>
          <button onClick={login} className="px-6 py-3 rounded-xl gradient-btn font-semibold text-sm hover:shadow-[0_0_20px_rgba(244,196,48,0.4)] transition">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5]">
      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-full bg-[#F4C430] text-[#0A0A0A] text-xl font-bold flex items-center justify-center">
            {address ? address.slice(2, 4).toUpperCase() : "?"}
          </div>
          <div>
            <button
              onClick={() => { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="flex items-center gap-2 text-[#F5F5F5] font-mono text-sm hover:text-[#F4C430] transition"
            >
              {shortAddr}
              {copied ? <span className="text-[#F4C430] text-[10px]">Copied!</span> : (
                <svg className="w-3.5 h-3.5 text-[#A1A1A1]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
            {email && <p className="text-[#A1A1A1]/50 text-xs mt-0.5">{email}</p>}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-white/[0.08] mb-8 overflow-x-auto">
          {(["profile", "agents", "deals", "wallets"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm capitalize transition border-b-2 whitespace-nowrap ${
                tab === t ? "border-[#F4C430] text-[#F5F5F5] font-medium" : "border-transparent text-[#A1A1A1]/50 hover:text-[#A1A1A1]"
              }`}
            >
              {t === "agents" ? "My Agents" : t === "deals" ? "My Deals" : t}
            </button>
          ))}
        </div>

        {/* ═══ PROFILE TAB ═══ */}
        {tab === "profile" && (
          <div className="space-y-8">
            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-[#F5F5F5] mb-2">Bio</label>
              <textarea
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                placeholder="Write your biography here..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none focus:border-[#F4C430]/40 text-sm resize-none transition"
              />
              <button onClick={handleSave} className="mt-3 px-5 py-2 rounded-lg bg-[#F4C430] text-[#0A0A0A] font-bold text-sm hover:shadow-[0_0_15px_rgba(244,196,48,0.3)] transition">
                {saved ? "Saved!" : "Save"}
              </button>
            </div>

            {/* Social connections */}
            <div>
              <h3 className="text-sm font-medium text-[#F5F5F5] mb-4">Connected Accounts</h3>
              <div className="space-y-3">
                {socialPlatforms.map((s) => (
                  <div key={s.platform} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
                        {s.platform === "GitHub" ? (
                          <svg className="w-5 h-5 text-[#F5F5F5]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
                        ) : s.platform === "Twitter" ? (
                          <svg className="w-5 h-5 text-[#F5F5F5]" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        ) : (
                          <svg className="w-5 h-5 text-[#F5F5F5]" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                        )}
                      </div>
                      <div>
                        <p className="text-[#F5F5F5] text-sm font-medium">{s.platform}</p>
                        {s.connected ? (
                          <p className="text-[#F4C430] text-xs">@{s.username}</p>
                        ) : (
                          <p className="text-[#A1A1A1]/40 text-xs">Not connected</p>
                        )}
                      </div>
                    </div>
                    {s.connected ? (
                      <button
                        onClick={() => handleDisconnect(s.platform)}
                        className="px-4 py-2 rounded-lg border border-white/[0.08] text-[#A1A1A1] text-xs hover:text-red-400 hover:border-red-400/30 transition"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(s.platform)}
                        disabled={connecting === s.platform}
                        className="px-4 py-2 rounded-lg bg-[#F4C430] text-[#0A0A0A] text-xs font-bold hover:shadow-[0_0_10px_rgba(244,196,48,0.3)] disabled:opacity-50 transition"
                      >
                        {connecting === s.platform ? "Connecting..." : "Connect"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Danger */}
            <div className="pt-4 border-t border-white/[0.06]">
              <button onClick={logout} className="px-4 py-2 rounded-lg border border-red-400/20 text-red-400 text-sm hover:bg-red-400/5 transition">
                Logout
              </button>
            </div>
          </div>
        )}

        {/* ═══ MY AGENTS TAB ═══ */}
        {tab === "agents" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[#A1A1A1] text-sm">Agents you own or registered</p>
              <Link href="/agents/register" className="px-4 py-2 rounded-lg bg-[#F4C430] text-[#0A0A0A] text-xs font-bold hover:shadow-[0_0_10px_rgba(244,196,48,0.3)] transition">
                Register New
              </Link>
            </div>

            {onChainAgents.length > 0 && onChainAgents.map((a: any) => (
              <Link key={a.agentId} href={`/agents/${a.agentId}`}
                className="flex items-center justify-between p-4 rounded-xl glass-card hover:border-[#F4C430]/50 transition group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#F4C430]/10 flex items-center justify-center text-[#F4C430] font-bold text-sm">
                    {a.name?.charAt(0) || "#"}
                  </div>
                  <div>
                    <p className="text-[#F5F5F5] text-sm font-medium group-hover:text-[#F4C430] transition">{a.name}</p>
                    <p className="text-[#A1A1A1]/40 text-xs">Agent #{a.agentId} · {a.jobsCompleted} jobs · ${a.revenue}</p>
                  </div>
                </div>
                <svg className="w-4 h-4 text-[#A1A1A1]/20 group-hover:text-[#F4C430] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}

            {agents.length > 0 && agents.map((a) => (
              <Link key={a.id} href={`/agents/${a.id}`}
                className="flex items-center justify-between p-4 rounded-xl glass-card hover:border-[#F4C430]/50 transition group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#A1A1A1] font-bold text-sm">
                    {a.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-[#F5F5F5] text-sm font-medium group-hover:text-[#F4C430] transition">{a.name}</p>
                    <p className="text-[#A1A1A1]/40 text-xs">Local · {a.pricePerCall} USDC</p>
                  </div>
                </div>
                <svg className="w-4 h-4 text-[#A1A1A1]/20 group-hover:text-[#F4C430] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}

            {agents.length === 0 && onChainAgents.length === 0 && (
              <div className="text-center py-12">
                <p className="text-[#A1A1A1]/40 text-sm mb-4">No agents registered yet</p>
                <Link href="/agents/register" className="px-5 py-2.5 rounded-lg gradient-btn text-sm font-bold">
                  Register Your First Agent
                </Link>
              </div>
            )}
          </div>
        )}

        {/* ═══ MY DEALS TAB ═══ */}
        {tab === "deals" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[#A1A1A1] text-sm">Your active and completed deals</p>
              <button onClick={loadDeals} disabled={dealsLoading}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[#A1A1A1] text-xs hover:text-[#F4C430] transition disabled:opacity-50">
                {dealsLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {dealsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-white/[0.03] animate-pulse" />)}
              </div>
            ) : deals.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[#A1A1A1]/40 text-sm mb-4">No deals yet</p>
                <Link href="/chat" className="px-5 py-2.5 rounded-lg gradient-btn text-sm font-bold">
                  Hire an Agent
                </Link>
              </div>
            ) : (
              deals.map((deal) => {
                const isBuyer = deal.buyer.toLowerCase() === address.toLowerCase();
                const status = DEAL_STATUS[deal.status] || "Unknown";
                return (
                  <div key={deal.dealId.toString()} className="p-4 rounded-xl glass-card">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[#A1A1A1]/40 text-xs font-mono">#{deal.dealId.toString()}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          status === "Completed" ? "bg-[#F4C430]/10 text-[#F4C430]" :
                          status === "Disputed" ? "bg-red-500/10 text-red-400" :
                          "bg-white/[0.06] text-[#A1A1A1]"
                        }`}>{status}</span>
                        <span className="text-[10px] text-[#A1A1A1]/30">{isBuyer ? "You bought" : "You sold"}</span>
                      </div>
                      <span className="text-[#F4C430] text-sm font-medium">{formatUnits(deal.amount, 6)} USDC</span>
                    </div>
                    <p className="text-[#F5F5F5] text-sm truncate">{deal.taskDescription}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[#A1A1A1]/30 text-[10px] font-mono">
                        {isBuyer ? `Seller: ${deal.seller.slice(0, 8)}...` : `Buyer: ${deal.buyer.slice(0, 8)}...`}
                      </span>
                      <a href={`https://sepolia.celoscan.io/address/${CONTRACTS.NASTAR_ESCROW}`} target="_blank"
                        className="text-[10px] text-[#A1A1A1]/30 hover:text-[#F4C430] transition">
                        View on CeloScan
                      </a>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ═══ WALLETS TAB ═══ */}
        {tab === "wallets" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[#A1A1A1]/50 text-xs uppercase tracking-wider">Connected Wallet</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-[#F4C430]/10 text-[#F4C430]">Active</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F4C430] text-[#0A0A0A] text-sm font-bold flex items-center justify-center">
                  {address ? address.slice(2, 4).toUpperCase() : "?"}
                </div>
                <code className="text-[#F5F5F5] text-xs font-mono break-all">{address}</code>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <span className="text-[#A1A1A1]/50 text-xs uppercase tracking-wider">Network</span>
              <div className="flex items-center gap-2 mt-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F4C430]" />
                <span className="text-[#F5F5F5] text-sm">Celo Sepolia (11142220)</span>
              </div>
            </div>

            <a href={`https://sepolia.celoscan.io/address/${address}`} target="_blank"
              className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-[#F4C430]/30 transition group">
              <span className="text-[#F5F5F5] text-sm">View on CeloScan</span>
              <svg className="w-4 h-4 text-[#A1A1A1]/30 group-hover:text-[#F4C430] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
