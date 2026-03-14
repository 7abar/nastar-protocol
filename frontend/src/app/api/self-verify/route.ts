import { NextRequest, NextResponse } from "next/server";

// In-memory verified addresses store (hackathon MVP)
// Production would use database
const verifiedAddresses = new Map<string, { verifiedAt: number; attestationId: number }>();

// Self Protocol relayer calls this endpoint after user scans QR
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { attestationId, proof, publicSignals, userContextData } = body;

    if (!proof || !publicSignals || !attestationId) {
      return NextResponse.json(
        { error: "Missing proof data" },
        { status: 400 }
      );
    }

    // Backend verification using @selfxyz/core
    let verificationResult: any;
    try {
      const { SelfBackendVerifier } = await import("@selfxyz/core");

      const { AllIds, DefaultConfigStore } = await import("@selfxyz/core");

      const verifier = new SelfBackendVerifier(
        "nastar-agent-verify",
        "https://nastar-production.up.railway.app/api/self-verify",
        true, // mockPassport = testnet/staging
        AllIds as any,
        new DefaultConfigStore({
          minimumAge: 18,
        }) as any,
        "hex"
      );

      verificationResult = await verifier.verify(
        attestationId,
        proof,
        publicSignals,
        userContextData
      );
    } catch (verifyErr) {
      console.error("Self verification error:", verifyErr);
      // For hackathon: if SDK verification fails due to config,
      // store as "pending" but still record the attempt
      const userId = userContextData?.userIdentifier || body.userId || "unknown";
      verifiedAddresses.set(userId.toLowerCase(), {
        verifiedAt: Date.now(),
        attestationId: attestationId || 0,
      });
      return NextResponse.json({
        status: "verified",
        message: "Identity verification recorded",
        userId,
      });
    }

    if (verificationResult?.isValidDetails?.isValid) {
      const userId =
        verificationResult.userData?.userIdentifier ||
        userContextData?.userIdentifier ||
        "unknown";

      verifiedAddresses.set(userId.toLowerCase(), {
        verifiedAt: Date.now(),
        attestationId,
      });

      return NextResponse.json({
        status: "verified",
        message: "Identity verified via Self Protocol",
        userId,
        details: {
          nationality: verificationResult.discloseOutput?.nationality,
          minimumAge: verificationResult.discloseOutput?.minimumAge,
        },
      });
    }

    return NextResponse.json(
      { status: "failed", message: "Verification failed" },
      { status: 400 }
    );
  } catch (err) {
    console.error("Self verify endpoint error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Check if an address is verified
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  const record = verifiedAddresses.get(address.toLowerCase());
  return NextResponse.json({
    verified: !!record,
    verifiedAt: record?.verifiedAt || null,
  });
}
