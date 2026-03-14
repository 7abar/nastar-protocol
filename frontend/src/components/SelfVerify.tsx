"use client";

import { useEffect, useState } from "react";

// Self Protocol verification component
// Generates QR code for passport/ID scanning via Self app
export function SelfVerify({
  address,
  onVerified,
}: {
  address: string;
  onVerified: () => void;
}) {
  const [selfApp, setSelfApp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const { SelfAppBuilder, countries } = await import("@selfxyz/qrcode");
        const app = new SelfAppBuilder({
          appName: "Nastar",
          scope: "nastar-agent-verify",
          endpoint: "https://nastar-production.up.railway.app/api/self-verify",
          logoBase64: "",
          userId: address,
          endpointType: "staging_celo",
          userIdType: "hex",
          disclosures: {
            minimumAge: 18,
            excludedCountries: [
              countries.NORTH_KOREA,
              countries.IRAN,
            ],
          },
        } as any).build();
        setSelfApp(app);
      } catch (err) {
        console.error("Self SDK init error:", err);
      }
      setLoading(false);
    }
    init();
  }, [address]);

  if (verified) {
    return (
      <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
        <span className="text-green-400 text-lg mr-2">&#10003;</span>
        <span className="text-green-400 font-medium">Identity Verified via Self Protocol</span>
        <p className="text-white/40 text-xs mt-1">
          Zero-knowledge proof of humanity confirmed
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
        <span className="text-white/30 animate-pulse">Loading Self verification...</span>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-blue-400">&#128274;</span>
        <h3 className="font-semibold text-white text-sm">Verify Identity (Optional)</h3>
      </div>
      <p className="text-white/40 text-xs mb-4">
        Scan your passport or ID with the Self app to get a verified badge.
        Zero-knowledge proof — no personal data is shared.
      </p>

      {selfApp ? (
        <div className="flex flex-col items-center gap-3">
          <div className="bg-white p-4 rounded-xl">
            {/* Self QR code renders here */}
            <div id="self-qr-placeholder" className="w-48 h-48 flex items-center justify-center">
              <SelfQRWrapper
                selfApp={selfApp}
                onSuccess={() => {
                  setVerified(true);
                  onVerified();
                }}
              />
            </div>
          </div>
          <p className="text-white/20 text-xs text-center">
            Scan with Self app (iOS/Android)
          </p>
        </div>
      ) : (
        <div className="text-center py-4">
          <a
            href="https://self.xyz/"
            target="_blank"
            className="text-blue-400 text-sm hover:underline"
          >
            Get the Self app to verify →
          </a>
        </div>
      )}
    </div>
  );
}

function SelfQRWrapper({ selfApp, onSuccess }: { selfApp: any; onSuccess: () => void }) {
  const [Component, setComponent] = useState<any>(null);

  useEffect(() => {
    import("@selfxyz/qrcode").then((mod) => {
      setComponent(() => mod.SelfQRcodeWrapper);
    });
  }, []);

  if (!Component) return <span className="text-gray-400 text-sm">Loading...</span>;

  return (
    <Component
      selfApp={selfApp}
      onSuccess={onSuccess}
      onError={() => console.error("Self verification failed")}
      size={192}
    />
  );
}
