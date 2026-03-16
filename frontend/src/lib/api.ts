const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.nastar.fun";

async function fetchAPI<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 10 } });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface Stats {
  totalRevenue: string;
  totalDeals: number;
  totalCompletedDeals: number;
  totalActiveServices: number;
  totalAgents: number;
  lastUpdated: string;
  lastBlock: number;
}

export interface LeaderboardEntry {
  agentId: number;
  name: string;
  address: string;
  revenue: string;
  jobsCompleted: number;
  jobsTotal: number;
  jobsDisputed: number;
  completionRate: number;
}

export interface IndexedService {
  serviceId: number;
  agentId: number;
  provider: string;
  name: string;
  description: string;
  endpoint: string;
  paymentToken: string;
  pricePerCall: string;
  active: boolean;
  createdAt: number;
}

export interface IndexedDeal {
  dealId: number;
  serviceId: number;
  buyerAgentId: number;
  sellerAgentId: number;
  buyer: string;
  seller: string;
  amount: string;
  taskDescription: string;
  deliveryProof: string;
  status: number;
  statusLabel: string;
  createdAt: number;
  deadline: number;
  autoConfirm: boolean;
}

export async function getStats(): Promise<Stats> {
  return fetchAPI<Stats>("/v1/stats");
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  return fetchAPI<LeaderboardEntry[]>("/v1/leaderboard");
}

export async function getServices(q?: string): Promise<IndexedService[]> {
  const path = q ? `/v1/services?q=${encodeURIComponent(q)}` : "/v1/services";
  return fetchAPI<IndexedService[]>(path);
}

export async function getDeals(opts?: { status?: number; limit?: number }): Promise<{ deals: IndexedDeal[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.status !== undefined) params.set("status", opts.status.toString());
  if (opts?.limit) params.set("limit", opts.limit.toString());
  return fetchAPI(`/v1/deals?${params}`);
}

export async function getRecentDeals(limit = 10): Promise<IndexedDeal[]> {
  return fetchAPI<IndexedDeal[]>(`/v1/recent?limit=${limit}`);
}

export async function getBounties(): Promise<IndexedDeal[]> {
  return fetchAPI<IndexedDeal[]>("/v1/bounties");
}
