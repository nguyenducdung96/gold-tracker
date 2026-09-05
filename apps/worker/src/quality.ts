import type { VietnamGoldQuote } from "./types.js";

export type VietnamQualitySummary = {
  product: "bar" | "ring";
  peerMedianBuy: number | null;
  peerMedianSell: number | null;
  consensusSize: number;
  totalSize: number;
};

const CONSENSUS_BAND_PCT = Number(process.env.VN_CONSENSUS_BAND_PCT ?? 6);
const OUTLIER_THRESHOLD_PCT = Number(process.env.VN_OUTLIER_THRESHOLD_PCT ?? 8);
const MAX_SPREAD_PCT = Number(process.env.VN_MAX_SPREAD_PCT ?? 8);
const MIN_CONSENSUS_SIZE = Math.max(3, Number(process.env.VN_MIN_CONSENSUS_SIZE ?? 3));

function median(values: number[]): number | null {
  if (!values.length) return null;
  const xs = [...values].sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function pctDiff(value: number, reference: number) {
  return ((value - reference) / reference) * 100;
}

function largestConsensusCluster(rows: VietnamGoldQuote[]) {
  if (!rows.length) return [] as VietnamGoldQuote[];
  let best: VietnamGoldQuote[] = [];
  for (const anchor of rows) {
    const cluster = rows.filter(row => {
      const ref = anchor.sell;
      return ref > 0 && Math.abs(pctDiff(row.sell, ref)) <= CONSENSUS_BAND_PCT;
    });
    if (cluster.length > best.length) best = cluster;
    else if (cluster.length === best.length && cluster.length) {
      const bestSpread = Math.max(...best.map(x => x.sell)) - Math.min(...best.map(x => x.sell));
      const nextSpread = Math.max(...cluster.map(x => x.sell)) - Math.min(...cluster.map(x => x.sell));
      if (nextSpread < bestSpread) best = cluster;
    }
  }
  return best;
}

export function validateVietnamQuotes(rows: VietnamGoldQuote[]): {
  rows: VietnamGoldQuote[];
  summaries: VietnamQualitySummary[];
} {
  const checkedAt = new Date().toISOString();
  const result: VietnamGoldQuote[] = rows.map(row => ({
    ...row,
    qualityState: "ok",
    qualityReasons: [] as string[],
    qualityCheckedAt: checkedAt,
    peerMedianBuy: null as number | null,
    peerMedianSell: null as number | null,
    peerDeviationPct: null as number | null
  }));

  const summaries: VietnamQualitySummary[] = [];

  for (const product of ["bar", "ring"] as const) {
    const group = result.filter(x => x.product === product);
    const cluster = largestConsensusCluster(group);
    const consensusReady = cluster.length >= MIN_CONSENSUS_SIZE;
    const medBuy = consensusReady ? median(cluster.map(x => x.buy)) : null;
    const medSell = consensusReady ? median(cluster.map(x => x.sell)) : null;

    summaries.push({
      product,
      peerMedianBuy: medBuy,
      peerMedianSell: medSell,
      consensusSize: cluster.length,
      totalSize: group.length
    });

    for (const row of group) {
      const reasons: string[] = [];
      const spreadPct = row.sell > 0 ? ((row.sell - row.buy) / row.sell) * 100 : 0;
      if (spreadPct > MAX_SPREAD_PCT) {
        reasons.push(`Spread ${spreadPct.toFixed(2)}% > ngưỡng ${MAX_SPREAD_PCT}%`);
      }

      if (medSell != null) {
        const dev = pctDiff(row.sell, medSell);
        row.peerMedianBuy = medBuy;
        row.peerMedianSell = medSell;
        row.peerDeviationPct = dev;
        if (Math.abs(dev) > OUTLIER_THRESHOLD_PCT) {
          reasons.push(
            `Giá bán lệch ${dev >= 0 ? "+" : ""}${dev.toFixed(2)}% so với đồng thuận ${cluster.length}/${group.length} hãng`
          );
        }
      }

      if (reasons.length) {
        row.qualityState = "suspect";
        row.qualityReasons = reasons;
      }
    }
  }

  return { rows: result, summaries };
}

export const vietnamQualityConfig = {
  consensusBandPct: CONSENSUS_BAND_PCT,
  outlierThresholdPct: OUTLIER_THRESHOLD_PCT,
  maxSpreadPct: MAX_SPREAD_PCT,
  minConsensusSize: MIN_CONSENSUS_SIZE
};
