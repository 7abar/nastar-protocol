"use client";

import { useEffect, useState } from "react";
import { isMiniPay } from "@/lib/minipay";

export function MiniPayBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isMiniPay());
  }, []);

  if (!show) return null;

  return (
    <div className="bg-[#E8500C]/10 border-b border-[#E8500C]/30 px-4 py-2 text-center">
      <span className="text-[#E8500C] text-sm font-medium">
        MiniPay Detected
      </span>
      <span className="text-[#A1A1A1] text-xs ml-2">
        — Connected via Opera MiniPay wallet
      </span>
    </div>
  );
}
