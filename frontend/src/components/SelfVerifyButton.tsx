"use client";

import { useState, useEffect } from "react";
import { SelfAppBuilder } from "@selfxyz/qrcode";
import dynamic from "next/dynamic";

// Dynamic import to avoid SSR issues with QR code
const SelfQRcodeWrapper = dynamic(
  () => import("@selfxyz/qrcode").then((m) => m.SelfQRcodeWrapper),
  { ssr: false }
);

interface SelfVerifyButtonProps {
  walletAddress: string;
  onVerified?: () => void;
}

const SELF_HUB_CELO_SEPOLIA = "0x16ECBA51e18a4a7e61fdC417f0d47AFEeDfbed74";
const SELF_HUB_CELO_MAINNET = "0xe57F4773bd9c9d8b6Cd70431117d353298B9f5BF";

export default function SelfVerifyButton({ walletAddress, onVerified }: SelfVerifyButtonProps) {
  const [showQR, setShowQR] = useState(false);
  const [verified, setVerified] = useState(false);
  const [selfApp, setSelfApp] = useState<any>(null);

  // Check localStorage for existing verification
  useEffect(() => {
    const stored = localStorage.getItem(`nastar-self-verified-${walletAddress}`);
    if (stored === "true") setVerified(true);
  }, [walletAddress]);

  useEffect(() => {
    if (!showQR || !walletAddress) return;

    const app = new SelfAppBuilder({
      appName: "Nastar Protocol",
      scope: "nastar-proof-of-human",
      endpoint: SELF_HUB_CELO_SEPOLIA,
      logoBase64: "",
      userId: walletAddress,
      endpointType: "staging_celo",
      userIdType: "hex",
      disclosures: {
        minimumAge: 18,
      },
    }).build();

    setSelfApp(app);
  }, [showQR, walletAddress]);

  function handleSuccess() {
    setVerified(true);
    setShowQR(false);
    localStorage.setItem(`nastar-self-verified-${walletAddress}`, "true");
    onVerified?.();
  }

  if (verified) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-400/10 border border-green-400/20 text-green-400 text-xs font-medium">
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
        </svg>
        Self Verified
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowQR(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.1] text-[#A1A1A1] text-xs font-medium hover:text-white hover:border-[#F4C430]/30 transition"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        Verify with Self
      </button>

      {/* QR Code Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] rounded-2xl border border-white/[0.1] p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#F5F5F5] font-semibold text-sm">Verify Your Identity</h3>
              <button
                onClick={() => setShowQR(false)}
                className="text-[#A1A1A1] hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-[#A1A1A1]/60 text-xs mb-4 leading-relaxed">
              Scan this QR code with the Self app to verify you are a real human.
              Uses zero-knowledge proofs -- no personal data is shared.
            </p>

            <div className="bg-white rounded-xl p-4 mb-4">
              {selfApp && (
                <SelfQRcodeWrapper
                  selfApp={selfApp}
                  onSuccess={handleSuccess}
                  onError={() => console.error("Self verification failed")}
                />
              )}
            </div>

            <div className="flex items-center gap-2 text-[#A1A1A1]/40 text-[10px]">
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Powered by Self Protocol -- ZK proof-of-human on Celo
            </div>
          </div>
        </div>
      )}
    </>
  );
}
