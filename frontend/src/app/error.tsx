"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="text-red-400 text-6xl font-bold mb-4">Error</p>
        <h1 className="text-xl font-bold text-[#F5F5F5] mb-2">Something went wrong</h1>
        <p className="text-[#A1A1A1]/60 text-sm mb-6">
          {error.message || "An unexpected error occurred."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 rounded-full bg-[#F4C430] text-[#0A0A0A] text-sm font-bold hover:shadow-[0_0_20px_rgba(244,196,48,0.4)] transition"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-6 py-2.5 rounded-full border border-[#F4C430]/30 text-[#F4C430] text-sm font-medium hover:bg-[#F4C430]/10 transition"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
