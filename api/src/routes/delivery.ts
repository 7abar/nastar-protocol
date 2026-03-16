/**
 * Delivery & Proof-of-Work System
 * 
 * Agents submit deliverables with proof. Buyers can verify before payment releases.
 * autoConfirm still works but now requires a delivery submission first.
 * 
 * Flow:
 * 1. Agent completes task
 * 2. Agent calls POST /v1/delivery/submit with proof (text/URL/file hash)
 * 3. Delivery is stored in Supabase with timestamp
 * 4. autoConfirm triggers ONLY after delivery is recorded
 * 5. Buyer can dispute within 3 days if deliverable is unsatisfactory
 */

import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "";
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// POST /v1/delivery/submit — Agent submits deliverable with proof
router.post("/submit", async (req: Request, res: Response) => {
  try {
    const { dealId, agentId, deliveryType, content, proofUrl, fileHash, summary } = req.body;

    if (!dealId || !agentId) {
      return res.status(400).json({ error: "dealId and agentId are required" });
    }

    if (!content && !proofUrl && !fileHash) {
      return res.status(400).json({ error: "At least one proof is required: content, proofUrl, or fileHash" });
    }

    if (!supabase) {
      return res.status(503).json({ error: "Database not configured" });
    }

    const delivery = {
      deal_id: Number(dealId),
      agent_id: Number(agentId),
      delivery_type: deliveryType || "text", // text, url, file, api_response
      content: content || null,
      proof_url: proofUrl || null,
      file_hash: fileHash || null,
      summary: summary || null,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("deliveries")
      .insert(delivery)
      .select()
      .single();

    if (error) {
      console.error("Delivery insert error:", error);
      return res.status(500).json({ error: "Failed to record delivery" });
    }

    return res.json({
      success: true,
      delivery: data,
      message: "Delivery recorded. autoConfirm will release payment after verification window.",
    });
  } catch (err) {
    console.error("Delivery submit error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /v1/delivery/:dealId — Get delivery status for a deal
router.get("/:dealId", async (req: Request, res: Response) => {
  try {
    const dealId = Number(req.params.dealId);
    if (!supabase) return res.status(503).json({ error: "Database not configured" });

    const { data, error } = await supabase
      .from("deliveries")
      .select("*")
      .eq("deal_id", dealId)
      .order("submitted_at", { ascending: false });

    if (error) return res.status(500).json({ error: "Failed to fetch deliveries" });

    return res.json({
      dealId,
      deliveries: data || [],
      hasDelivery: (data || []).length > 0,
      latestStatus: data?.[0]?.status || "pending",
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /v1/delivery/agent/:agentId — All deliveries by an agent
router.get("/agent/:agentId", async (req: Request, res: Response) => {
  try {
    const agentId = Number(req.params.agentId);
    if (!supabase) return res.status(503).json({ error: "Database not configured" });

    const { data, error } = await supabase
      .from("deliveries")
      .select("*")
      .eq("agent_id", agentId)
      .order("submitted_at", { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: "Failed to fetch deliveries" });

    return res.json({ agentId, deliveries: data || [] });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
