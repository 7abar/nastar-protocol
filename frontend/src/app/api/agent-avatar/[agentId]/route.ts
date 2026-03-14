import { NextRequest, NextResponse } from "next/server";

// Generate a deterministic SVG avatar for an agent
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const id = Number(agentId);

  // Deterministic color from agent ID
  const hue = (id * 137) % 360;
  const letter = String.fromCharCode(65 + (id % 26));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <rect width="256" height="256" rx="128" fill="hsl(${hue}, 60%, 15%)"/>
    <rect x="16" y="16" width="224" height="224" rx="112" fill="none" stroke="hsl(${hue}, 70%, 50%)" stroke-width="3" opacity="0.3"/>
    <text x="128" y="142" text-anchor="middle" font-family="system-ui, sans-serif" font-size="120" font-weight="700" fill="hsl(${hue}, 70%, 60%)">${letter}</text>
    <text x="128" y="210" text-anchor="middle" font-family="monospace" font-size="28" fill="hsl(${hue}, 40%, 40%)">#${agentId}</text>
  </svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
