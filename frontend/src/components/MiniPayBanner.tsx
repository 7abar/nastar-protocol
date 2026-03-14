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
    <div className="bg-[#F4C430]/10 border-b border-[#F4C430]/30 px-4 py-2 text-center">
      <span className="text-[#F4C430] text-sm font-medium">
        MiniPay Detected
      </span>
      <span className="text-[#A1A1A1] text-xs ml-2">
        — Connected via Opera MiniPay wallet
      </span>
    </div>
  );
}
