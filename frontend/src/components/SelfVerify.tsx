"use client";

import { useEffect, useState } from "react";
import { isMobile } from "@/lib/minipay";

const SELF_ENDPOINT = "https://nastar-production.up.railway.app/api/self-verify";
const SELF_SCOPE = "nastar-agent-verify";
const SELF_APP_NAME = "Nastar";

interface SelfVerifyProps {
  address: string;
  onVerified: () => void;
}

export function SelfVerify({ address, onVerified }: SelfVerifyProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "verified" | "error">("idle");
  const [selfApp, setSelfApp] = useState<any>(null);
  const [universalLink, setUniversalLink] = useState("");
  const [QRComponent, setQRComponent] = useState<any>(null);

  // Check if already verified
  useEffect(() => {
    fetch(`/api/self-verify?address=${address}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.verified) {
          setStatus("verified");
          onVerified();
        }
      })
      .catch(() => {});
  }, [address]);

  // Initialize Self SDK
  useEffect(() => {
    if (status === "verified") return;
    setStatus("loading");

    async function init() {
      try {
        const { SelfAppBuilder, SelfQRcodeWrapper } = await import("@selfxyz/qrcode");
        const { getUniversalLink } = await import("@selfxyz/core");

        const app = new SelfAppBuilder({
          appName: SELF_APP_NAME,
          scope: SELF_SCOPE,
          endpoint: SELF_ENDPOINT,
          logoBase64: "",
          userId: address,
          endpointType: "staging_https",
          userIdType: "hex",
          disclosures: {
            minimumAge: 18,
          },
        } as any).build();

        setSelfApp(app);
        setQRComponent(() => SelfQRcodeWrapper);

        try {
          const link = getUniversalLink(app);
          setUniversalLink(link);
        } catch {
          // deeplink generation optional
        }

        setStatus("ready");
      } catch (err) {
        console.error("Self SDK init failed:", err);
        setStatus("error");
      }
    }
    init();
  }, [address, status]);

  if (status === "verified") {
    return (
      <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
            <span className="text-green-400 font-bold">&#10003;</span>
          </div>
          <div>
            <p className="text-green-400 font-medium text-sm">Identity Verified</p>
            <p className="text-white/30 text-xs">
              Self Protocol ZK proof of humanity confirmed
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
        <div className="animate-spin w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-2" />
        <p className="text-white/30 text-sm">Initializing Self Protocol...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <p className="text-white/30 text-sm text-center">
          Self verification unavailable.{" "}
          <button onClick={() => setStatus("idle")} className="text-blue-400 underline">
            Retry
          </button>
        </p>
      </div>
    );
  }

  const mobile = isMobile();

  return (
    <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded bg-blue-500/20 flex items-center justify-center">
          <span className="text-blue-400 text-xs font-bold">S</span>
        </div>
        <h3 className="font-semibold text-white text-sm">Verify Identity (Optional)</h3>
      </div>

      <p className="text-white/40 text-xs mb-4 leading-relaxed">
        Get a verified badge by scanning your passport or ID with the Self app.
        Zero-knowledge proof — no personal data is shared on-chain.
      </p>

      {mobile && universalLink ? (
        /* Mobile: deeplink button to Self app */
        <button
          onClick={() => window.open(universalLink, "_blank")}
          className="w-full py-3 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-400 transition text-sm"
        >
          Open Self App to Verify
        </button>
      ) : selfApp && QRComponent ? (
        /* Desktop: QR code */
        <div className="flex flex-col items-center gap-3">
          <div className="bg-white p-3 rounded-xl inline-block">
            <QRComponent
              selfApp={selfApp}
              onSuccess={() => {
                setStatus("verified");
                onVerified();
              }}
              onError={(err: any) => {
                console.error("Self verification failed:", err);
              }}
              size={180}
            />
          </div>
          <p className="text-white/20 text-xs text-center">
            Scan with Self app (iOS / Android)
          </p>
        </div>
      ) : null}

      <div className="mt-3 text-center">
        <a
          href="https://self.xyz/"
          target="_blank"
          rel="noopener"
          className="text-blue-400/60 text-xs hover:text-blue-400 transition"
        >
          Don't have Self app? Download here
        </a>
      </div>
    </div>
  );
}
