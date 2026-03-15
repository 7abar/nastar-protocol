/**
 * MiniPay Detection & Compatibility
 *
 * MiniPay is Opera's stablecoin wallet with 10M+ users in the Global South.
 * It injects a wallet provider via window.ethereum with isMiniPay flag.
 *
 * https://docs.celo.org/build-on-celo/build-on-minipay/overview
 */

declare global {
  interface Window {
    ethereum?: {
      isMiniPay?: boolean;
      isOpera?: boolean;
      request: (args: { method: string; params?: any[] }) => Promise<any>;
    };
  }
}

/**
 * Check if the user is browsing from MiniPay wallet
 */
export function isMiniPay(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.ethereum?.isMiniPay;
}

/**
 * Check if the user is browsing from Opera browser (MiniPay parent)
 */
export function isOperaBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.ethereum?.isOpera || /OPR|Opera/i.test(navigator.userAgent);
}

/**
 * Get MiniPay wallet address if available
 */
export async function getMiniPayAddress(): Promise<string | null> {
  if (!isMiniPay()) return null;
  try {
    const accounts = await window.ethereum!.request({ method: "eth_accounts" });
    return accounts?.[0] || null;
  } catch {
    return null;
  }
}
