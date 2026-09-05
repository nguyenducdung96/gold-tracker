import type { WorldGoldQuote } from "../types.js";
import { getStooqPreviousClose } from "./worldHistory.js";

const TE_PAGE = "https://tradingeconomics.com/commodity/gold";
const GOLD_API_PAGE = "https://gold-api.com/";

let previousCloseCache: {
  value: number | null;
  source: "stooq" | null;
  expiresAt: number;
} = { value: null, source: null, expiresAt: 0 };

async function getCachedFallbackPreviousClose() {
  if (Date.now() < previousCloseCache.expiresAt && previousCloseCache.value != null) {
    return previousCloseCache;
  }

  try {
    const value = await getStooqPreviousClose();
    if (value != null) {
      previousCloseCache = {
        value,
        source: "stooq",
        // Previous close does not need a request every realtime tick.
        expiresAt: Date.now() + 10 * 60_000
      };
    }
  } catch (error) {
    console.error("Previous-close fallback failed:", error);
  }

  return previousCloseCache;
}

function withChange(price: number, previousClose: number | null) {
  if (!previousClose || !Number.isFinite(previousClose)) {
    return { changeAbs: null, changePct: null };
  }
  const changeAbs = price - previousClose;
  return {
    changeAbs,
    changePct: (changeAbs / previousClose) * 100
  };
}

async function fetchTE(apiKey: string): Promise<WorldGoldQuote> {
  const url = new URL("https://api.tradingeconomics.com/markets/commodities");
  url.searchParams.set("c", apiKey);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Trading Economics HTTP ${res.status}`);

  const rows = (await res.json()) as any[];
  const gold = rows.find((x) => {
    const text = `${x?.Name ?? ""} ${x?.Symbol ?? ""} ${x?.Ticker ?? ""}`.toLowerCase();
    return text.includes("gold") || text.includes("gac:com") || text.includes("xau");
  });
  if (!gold) throw new Error("Gold not found in Trading Economics response");

  const price = Number(gold.Last ?? gold.Value ?? gold.Price ?? gold.Close);
  if (!Number.isFinite(price)) throw new Error("Invalid TE gold price");

  let previousClose = Number(gold.PreviousClose ?? gold.PrevClose);
  let previousCloseSource: "tradingeconomics" | "stooq" | null = "tradingeconomics";
  if (!Number.isFinite(previousClose)) {
    const fallback = await getCachedFallbackPreviousClose();
    previousClose = fallback.value ?? NaN;
    previousCloseSource = fallback.source;
  }

  let changePct = Number(gold.PercentageChange ?? gold.ChangePercent ?? gold.PercentChange);
  const computed = withChange(price, Number.isFinite(previousClose) ? previousClose : null);
  if (!Number.isFinite(changePct)) changePct = computed.changePct ?? NaN;

  const changeAbsRaw = Number(gold.Change ?? gold.ChangeValue);
  const changeAbs = Number.isFinite(changeAbsRaw) ? changeAbsRaw : computed.changeAbs;
  const now = new Date().toISOString();

  return {
    symbol: "XAUUSD",
    price,
    currency: "USD",
    unit: "troy_ounce",
    source: "tradingeconomics",
    sourceUrl: TE_PAGE,
    observedAt: new Date(gold.Date ?? Date.now()).toISOString(),
    receivedAt: now,
    previousClose: Number.isFinite(previousClose) ? previousClose : null,
    previousCloseSource,
    changeAbs: changeAbs ?? null,
    changePct: Number.isFinite(changePct) ? changePct : null
  };
}

async function fetchGoldApi(): Promise<WorldGoldQuote> {
  const [res, fallback] = await Promise.all([
    fetch("https://api.gold-api.com/price/XAU", {
      signal: AbortSignal.timeout(8000),
      headers: {
        "user-agent": "gold-tracker-pwa/3.0",
        accept: "application/json"
      },
      cache: "no-store"
    }),
    getCachedFallbackPreviousClose()
  ]);

  if (!res.ok) throw new Error(`Gold-API HTTP ${res.status}`);
  const data = await res.json() as {
    price: number;
    updatedAt?: string;
    updated_at?: string;
  };

  const price = Number(data.price);
  if (!Number.isFinite(price)) throw new Error("Invalid Gold-API price");

  const previousClose = fallback.value;
  const change = withChange(price, previousClose);
  const sourceTime = data.updatedAt ?? data.updated_at;
  const now = new Date().toISOString();

  return {
    symbol: "XAUUSD",
    price,
    currency: "USD",
    unit: "troy_ounce",
    source: "gold-api",
    sourceUrl: GOLD_API_PAGE,
    observedAt: sourceTime ? new Date(sourceTime).toISOString() : now,
    receivedAt: now,
    previousClose,
    previousCloseSource: fallback.source,
    changeAbs: change.changeAbs,
    changePct: change.changePct
  };
}

export async function getWorldGoldQuote(): Promise<WorldGoldQuote> {
  return fetchGoldApi();
}
