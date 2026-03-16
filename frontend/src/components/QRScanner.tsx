"use client";

import { useEffect, useRef, useState } from "react";

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

// Parse QRIS/EMVCo QR code TLV format
function parseEMVCo(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= raw.length) {
    const tag = raw.substring(i, i + 2);
    const len = parseInt(raw.substring(i + 2, i + 4), 10);
    if (isNaN(len) || i + 4 + len > raw.length) break;
    result[tag] = raw.substring(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return result;
}

export interface QRISData {
  type: "qris" | "address" | "unknown";
  raw: string;
  // QRIS fields
  merchantName?: string;
  merchantCity?: string;
  amount?: number;
  currency?: string;
  // Crypto fields
  address?: string;
  token?: string;
  sendAmount?: string;
}

export function parseQRData(raw: string): QRISData {
  // Check if it's a crypto address
  if (/^0x[a-fA-F0-9]{40}$/.test(raw.trim())) {
    return { type: "address", raw, address: raw.trim() };
  }

  // Check if it's an EIP-681 payment URI (ethereum:0x...)
  const eipMatch = raw.match(/^(?:ethereum|celo):([0-9a-fA-F]{40})(?:@(\d+))?(?:\?(.*))?/);
  if (eipMatch) {
    const params = new URLSearchParams(eipMatch[3] || "");
    return {
      type: "address",
      raw,
      address: "0x" + eipMatch[1],
      sendAmount: params.get("value") || params.get("amount") || undefined,
      token: params.get("token") || undefined,
    };
  }

  // Try QRIS/EMVCo parsing
  const emv = parseEMVCo(raw);
  if (emv["00"] && (emv["00"] === "01" || emv["00"] === "02")) {
    // Valid EMVCo QR
    const merchantInfo = emv["26"] || emv["51"] || "";
    const subMerchant = parseEMVCo(merchantInfo);

    // Parse tag 54 = amount, 58 = country, 59 = merchant name, 60 = merchant city
    const amount = emv["54"] ? parseFloat(emv["54"]) : undefined;
    const country = emv["58"] || "ID";
    const merchantName = emv["59"] || subMerchant["01"] || "Unknown Merchant";
    const merchantCity = emv["60"] || "";
    const currency = country === "ID" ? "IDR" : "USD";

    return {
      type: "qris",
      raw,
      merchantName,
      merchantCity,
      amount,
      currency,
    };
  }

  return { type: "unknown", raw };
}

export default function QRScanner({ onScan, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let animId: number;
    let active = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          scanFrame();
        }
      } catch {
        setError("Camera access denied. Use the upload button instead.");
      }
    }

    async function scanFrame() {
      if (!active || !videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx || video.readyState < 2) {
        animId = requestAnimationFrame(scanFrame);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      try {
        // Dynamic import to avoid SSR issues
        const { default: jsQR } = await import("jsqr");
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);
        if (code?.data) {
          setScanning(false);
          onScan(code.data);
          return;
        }
      } catch {}

      animId = requestAnimationFrame(scanFrame);
    }

    startCamera();
    return () => {
      active = false;
      cancelAnimationFrame(animId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      try {
        const { default: jsQR } = await import("jsqr");
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);
        if (code?.data) {
          onScan(code.data);
        } else {
          setError("No QR code found in image. Try again.");
        }
      } catch {
        setError("Failed to decode QR code.");
      }
    };
    img.src = URL.createObjectURL(file);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
        <h3 className="text-white font-semibold">Scan QR Code</h3>
        <button onClick={onClose} className="text-white/70 hover:text-white text-2xl">&times;</button>
      </div>

      {/* Camera view */}
      <div className="relative w-full max-w-md aspect-square">
        <video ref={videoRef} className="w-full h-full object-cover rounded-2xl" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />

        {/* Scan overlay */}
        {scanning && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-64 h-64 border-2 border-[#F4C430] rounded-2xl relative">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#F4C430] rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#F4C430] rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#F4C430] rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#F4C430] rounded-br-xl" />
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#F4C430]/50 animate-pulse" style={{ animation: "scan 2s ease-in-out infinite" }} />
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-red-400 text-sm mt-4 px-4 text-center">{error}</p>}

      {/* Upload button */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          className="px-6 py-2.5 rounded-xl bg-white/10 text-white text-sm hover:bg-white/20 transition"
        >
          Upload QR Image
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

      <p className="text-white/40 text-xs mt-4">Scan QRIS, wallet address, or payment QR code</p>
    </div>
  );
}
