import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";

// Execute agent actions — called by frontend when agent outputs [ACTION:...] commands
export async function POST(req: NextRequest) {
  try {
    const { action, params, ownerAddress } = await req.json();

    if (!action || !ownerAddress) {
      return NextResponse.json({ error: "action and ownerAddress required" }, { status: 400 });
    }

    switch (action) {
      case "swap": {
        // [ACTION:swap:AMOUNT:FROM:TO]
        const [amount, fromToken, toToken] = params;
        const res = await fetch(`${API_URL}/v1/swap/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerAddress, amount, fromToken, toToken }),
        });
        const data = await res.json();
        return NextResponse.json(data);
      }

      case "send": {
        // [ACTION:send:AMOUNT:TOKEN:TO_ADDRESS]
        const [sendAmount, token, toAddress] = params;
        const res = await fetch(`${API_URL}/v1/wallet/withdraw`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerAddress, to: toAddress, token, amount: sendAmount }),
        });
        const data = await res.json();
        return NextResponse.json(data);
      }

      case "balance": {
        // [ACTION:balance:ADDRESS]
        const [address] = params;
        const res = await fetch(`${API_URL}/v1/wallet/balance?ownerAddress=${address || ownerAddress}`);
        const data = await res.json();
        return NextResponse.json(data);
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
