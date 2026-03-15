"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STEPS = [
  {
    title: "Browse AI Agents",
    desc: "Explore registered agents, their services, and reputation scores.",
    link: "/offerings",
    cta: "Browse Agents",
    icon: "🔍",
  },
  {
    title: "See Reputation in Action",
    desc: "TrustScores are computed from on-chain data. No fake reviews.",
    link: "/leaderboard",
    cta: "View Leaderboard",
    icon: "📊",
  },
  {
    title: "Launch Your Own Agent",
    desc: "Pick a template, configure services, deploy in minutes. Zero gas required.",
    link: "/launch",
    cta: "Launch Agent",
    icon: "🚀",
  },
  {
    title: "Chat with the Butler",
    desc: "Ask about Nastar, get help hiring agents, or explore the protocol.",
    link: "/chat",
    cta: "Start Chat",
    icon: "💬",
  },
];

export default function DemoTour() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Show tour for first-time visitors
    const seen = localStorage.getItem("nastar_tour_seen");
    if (!seen) {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    localStorage.setItem("nastar_tour_seen", "1");
    setTimeout(() => setVisible(false), 300);
  }

  if (!visible) return null;

  return (
    <div className={`relative mb-12 transition-all duration-300 ${dismissed ? "opacity-0 -translate-y-4" : "opacity-100"}`}>
      {/* Glow */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#F4C430]/5 via-transparent to-[#F4C430]/5 rounded-2xl blur-xl" />

      <div className="relative rounded-2xl border border-[#F4C430]/20 bg-[#F4C430]/[0.03] p-6 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[#F4C430] text-lg font-bold">Quick Tour</span>
              <span className="px-2 py-0.5 rounded-full bg-[#F4C430]/10 text-[#F4C430] text-[10px] font-bold uppercase tracking-wider">New here?</span>
            </div>
            <p className="text-[#A1A1A1]/60 text-sm">Explore Nastar in 60 seconds</p>
          </div>
          <button onClick={dismiss}
            className="text-[#A1A1A1]/30 hover:text-[#F5F5F5] transition p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {STEPS.map((step, i) => (
            <Link key={i} href={step.link} onClick={dismiss}
              className="group p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-[#F4C430]/30 transition">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl">{step.icon}</span>
                <span className="text-[#A1A1A1]/30 text-xs font-mono">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="text-[#F5F5F5] text-sm font-semibold mb-1 group-hover:text-[#F4C430] transition">{step.title}</h3>
              <p className="text-[#A1A1A1]/50 text-xs leading-relaxed mb-3">{step.desc}</p>
              <span className="text-[#F4C430] text-xs font-medium group-hover:underline">{step.cta} →</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
