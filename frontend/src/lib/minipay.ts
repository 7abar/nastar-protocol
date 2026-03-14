// MiniPay detection — Opera Mini browser with injected wallet
// MiniPay has 10M+ users in the Global South

export function isMiniPay(): boolean {
  if (typeof window === "undefined") return false;
  // MiniPay injects window.ethereum with isMiniPay flag
  const eth = (window as any).ethereum;
  return eth?.isMiniPay === true;
}

export function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}
