export type WorldGoldQuote = {
  symbol: string;
  price: number;
  source: "tradingeconomics" | "gold-api";
  sourceUrl: string;
  sourceKind?: "official" | "fallback";
  verificationState?: "official" | "cross-verified" | "single-source";
  verificationSources?: string[];
  observedAt: string;
  receivedAt: string;
  previousClose?: number | null;
  previousCloseSource?: "tradingeconomics" | "stooq" | "local-db" | null;
  changeAbs?: number | null;
  changePct?: number | null;
};

export type VNQuote = {
  brand: string;
  product: "bar" | "ring";
  productName: string;
  buy: number;
  sell: number;
  sourceUrl: string;
  sourceKind?: "official" | "fallback";
  verificationState?: "official" | "cross-verified" | "single-source";
  verificationSources?: string[];
  observedAt: string;
  region?: string;
  qualityState?: "ok" | "suspect";
  qualityReasons?: string[];
  qualityCheckedAt?: string;
  peerMedianBuy?: number | null;
  peerMedianSell?: number | null;
  peerDeviationPct?: number | null;
};

export type ProviderStatus = {
  brand: string;
  url: string;
  homeUrl: string;
  available: boolean;
  state: "live" | "fallback" | "error";
  stale?: boolean;
  sourceKind: "official" | "fallback" | null;
  sourceLabel: string | null;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  error: string | null;
  diagnostics?: string[];
  qualityState?: "ok" | "suspect" | null;
  suspectProducts?: ("bar" | "ring")[];
};

export type Dashboard = {
  world: WorldGoldQuote | null;
  vietnam: VNQuote[];
  providers: ProviderStatus[];
  usdVnd: number | null;
  worldVndPerLuong: number | null;
  pollIntervals?: {
    worldMs: number;
    vietnamMs: number;
    fxMs: number;
  };
  dataQuality?: {
    config: { consensusBandPct: number; outlierThresholdPct: number; maxSpreadPct: number; minConsensusSize: number };
    summaries: { product: "bar" | "ring"; peerMedianBuy: number | null; peerMedianSell: number | null; consensusSize: number; totalSize: number }[];
    suspectCount: number;
  };
  serverTime: string;
};

export type WorldRange = "1D" | "1W" | "1M" | "6M" | "1Y" | "5Y" | "10Y" | "25Y" | "50Y" | "ALL";
export type WorldHistoryPoint = { ts: number; price: number; open?: number; high?: number; low?: number; source?: string };
export type WorldHistoryResponse = { range: WorldRange; source: string; points: WorldHistoryPoint[] };
