"use client";

import { useState, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import Link from "next/link";

interface UserProfile {
  bio: string;
  twitter: string;
  telegram: string;
  github: string;
  website: string;
}

function loadProfile(address: string): UserProfile {
  try {
    const stored = localStorage.getItem(`nastar-profile-${address.toLowerCase()}`);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { bio: "", twitter: "", telegram: "", github: "", website: "" };
}

function saveProfile(address: string, profile: UserProfile) {
  localStorage.setItem(`nastar-profile-${address.toLowerCase()}`, JSON.stringify(profile));
}

export default function SettingsPage() {
  const { authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const [activeTab, setActiveTab] = useState<"profile" | "wallets">("profile");
  const [profile, setProfile] = useState<UserProfile>({ bio: "", twitter: "", telegram: "", github: "", website: "" });
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const address = wallets[0]?.address || "";
  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
  const email = user?.email?.address || "";

  useEffect(() => {
    if (address) setProfile(loadProfile(address));
  }, [address]);

  function handleSave() {
    if (!address) return;
    saveProfile(address, profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-bold text-[#F5F5F5] mb-2">Account Settings</h2>
          <p className="text-[#A1A1A1] text-sm mb-6">Connect your wallet to manage your profile.</p>
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
        {/* Back + Title */}
        <Link href="/" className="inline-flex items-center gap-1 text-[#A1A1A1] text-sm hover:text-[#F4C430] transition mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Account Settings
        </Link>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-white/[0.08] mb-8">
          {(["profile", "wallets"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm capitalize transition border-b-2 ${
                activeTab === tab
                  ? "border-[#F4C430] text-[#F5F5F5] font-medium"
                  : "border-transparent text-[#A1A1A1]/50 hover:text-[#A1A1A1]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="space-y-8">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#F4C430] text-[#0A0A0A] text-xl font-bold flex items-center justify-center">
                {address ? address.slice(2, 4).toUpperCase() : "?"}
              </div>
              <div>
                <p className="text-[#F5F5F5] font-medium">{shortAddr}</p>
                {email && <p className="text-[#A1A1A1]/50 text-xs">{email}</p>}
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-[#F5F5F5] mb-2">Bio</label>
              <textarea
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                placeholder="Write your biography here..."
                rows={4}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#F5F5F5] placeholder-[#A1A1A1]/30 focus:outline-none focus:border-[#F4C430]/40 text-sm resize-none transition"
              />
            </div>

            {/* Save */}
            <button
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl bg-[#F4C430] text-[#0A0A0A] font-bold text-sm hover:shadow-[0_0_15px_rgba(244,196,48,0.3)] transition"
            >
              {saved ? "Saved!" : "Save"}
            </button>

            {/* Social Links */}
            <div>
              <h3 className="text-sm font-medium text-[#F5F5F5] mb-4">Social Links</h3>
              <div className="space-y-3">
                {[
                  { key: "twitter" as const, icon: "X", label: "Twitter / X", placeholder: "@username" },
                  { key: "telegram" as const, icon: "T", label: "Telegram", placeholder: "@username" },
                  { key: "github" as const, icon: "G", label: "GitHub", placeholder: "username" },
                  { key: "website" as const, icon: "W", label: "Website", placeholder: "https://" },
                ].map((social) => (
                  <div key={social.key} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-[#A1A1A1]/60 text-xs font-bold shrink-0">
                      {social.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#A1A1A1]/50 text-[10px] uppercase tracking-wider">{social.label}</p>
                      <input
                        value={profile[social.key]}
                        onChange={(e) => setProfile({ ...profile, [social.key]: e.target.value })}
                        placeholder={social.placeholder}
                        className="w-full bg-transparent text-[#F5F5F5] text-sm placeholder-[#A1A1A1]/20 focus:outline-none mt-0.5"
                      />
                    </div>
                    {profile[social.key] ? (
                      <button
                        onClick={() => setProfile({ ...profile, [social.key]: "" })}
                        className="px-3 py-1 rounded-lg border border-white/[0.08] text-[#A1A1A1] text-xs hover:text-red-400 hover:border-red-400/30 transition"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <span className="text-[#A1A1A1]/20 text-xs">Not set</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Danger zone */}
            <div className="pt-4 border-t border-white/[0.06]">
              <button
                onClick={logout}
                className="px-4 py-2 rounded-lg border border-red-400/20 text-red-400 text-sm hover:bg-red-400/5 transition"
              >
                Logout
              </button>
            </div>
          </div>
        )}

        {/* Wallets Tab */}
        {activeTab === "wallets" && (
          <div className="space-y-6">
            {/* Connected wallet */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[#A1A1A1]/50 text-xs uppercase tracking-wider">Connected Wallet</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-[#F4C430]/10 text-[#F4C430]">Active</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F4C430] text-[#0A0A0A] text-sm font-bold flex items-center justify-center">
                  {address ? address.slice(2, 4).toUpperCase() : "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="flex items-center gap-2 font-mono text-sm text-[#F5F5F5] hover:text-[#F4C430] transition"
                  >
                    {address}
                    <svg className="w-3.5 h-3.5 text-[#A1A1A1]/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    {copied && <span className="text-[#F4C430] text-[10px]">Copied!</span>}
                  </button>
                </div>
              </div>
            </div>

            {/* Network */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <span className="text-[#A1A1A1]/50 text-xs uppercase tracking-wider">Network</span>
              <div className="flex items-center gap-2 mt-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F4C430]" />
                <span className="text-[#F5F5F5] text-sm">Celo Sepolia (11142220)</span>
              </div>
              <p className="text-[#A1A1A1]/40 text-xs mt-1">Testnet — all transactions use test tokens</p>
            </div>

            {/* Quick links */}
            <div className="space-y-2">
              <a
                href={`https://sepolia.celoscan.io/address/${address}`}
                target="_blank"
                className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-[#F4C430]/30 transition group"
              >
                <span className="text-[#F5F5F5] text-sm">View on CeloScan</span>
                <svg className="w-4 h-4 text-[#A1A1A1]/30 group-hover:text-[#F4C430] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
              <Link
                href="/agents"
                className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-[#F4C430]/30 transition group"
              >
                <span className="text-[#F5F5F5] text-sm">My Agents</span>
                <svg className="w-4 h-4 text-[#A1A1A1]/30 group-hover:text-[#F4C430] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
              <Link
                href="/deals"
                className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-[#F4C430]/30 transition group"
              >
                <span className="text-[#F5F5F5] text-sm">My Deals</span>
                <svg className="w-4 h-4 text-[#A1A1A1]/30 group-hover:text-[#F4C430] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
