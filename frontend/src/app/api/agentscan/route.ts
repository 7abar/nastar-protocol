import { NextRequest, NextResponse } from "next/server";

// Proxy for Agentscan API (their API has no CORS headers)
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  const tokenId = req.nextUrl.searchParams.get("tokenId");
  
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  
  try {
    const res = await fetch(
      `https://agentscan.info/api/agents?network_id=celo&search=${encodeURIComponent(name)}`,
      { next: { revalidate: 3600 } } // cache 1 hour
    );
    if (!res.ok) return NextResponse.json({ url: null });
    
    const data = await res.json();
    const tid = tokenId ? Number(tokenId) : null;
    const match = (data.items || []).find(
      (a: any) => (tid ? a.token_id === tid : true) && a.network_id === "celo"
    );
    
    return NextResponse.json({
      url: match ? `https://agentscan.info/agents/${match.id}` : null,
      uuid: match?.id || null,
    });
  } catch {
    return NextResponse.json({ url: null });
  }
}
