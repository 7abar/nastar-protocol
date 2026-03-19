/**
 * Gas Sponsorship Helper
 *
 * Requests a small CELO drip from the Nastar sponsor wallet
 * so users can transact without holding CELO.
 * Call before any user-wallet transaction (hire, deal, launch).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";

export async function ensureGas(address: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/sponsor/gas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // 429 = rate limited, user already got gas recently — proceed anyway
    if (res.status === 429) return;
    throw new Error(data.error || "Gas sponsorship failed");
  }
}
