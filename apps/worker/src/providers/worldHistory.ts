export type HistoryRange = "1D" | "1W" | "1M" | "6M" | "1Y" | "5Y" | "10Y" | "25Y" | "50Y" | "ALL";

export type WorldHistoryPoint = {
  ts: number;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  source: "tradingeconomics" | "stooq" | "local";
};

function dateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function compactDate(d: Date) {
  return dateOnly(d).replaceAll("-", "");
}

function startForRange(range: Exclude<HistoryRange, "1D" | "ALL">) {
  const d = new Date();
  const days: Record<string, number> = {
    "1W": 7,
    "1M": 31,
    "6M": 183,
    "1Y": 366,
    "5Y": 365.25 * 5,
    "10Y": 365.25 * 10,
    "25Y": 365.25 * 25,
    "50Y": 365.25 * 50
  };
  d.setUTCDate(d.getUTCDate() - Math.ceil(days[range]));
  return d;
}

function downsample<T>(rows: T[], max = 900): T[] {
  if (rows.length <= max) return rows;
  const step = Math.ceil(rows.length / max);
  const out: T[] = [];
  for (let i = 0; i < rows.length; i += step) out.push(rows[i]);
  if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1]);
  return out;
}

function parseTEDate(value: unknown): number {
  if (typeof value !== "string") return NaN;
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return direct;
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return NaN;
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

async function fetchTradingEconomicsHistory(range: Exclude<HistoryRange, "1D">, apiKey: string): Promise<WorldHistoryPoint[]> {
  const end = new Date();
  const start = range === "ALL" ? new Date(Date.UTC(1968, 0, 1)) : startForRange(range);
  // GAC:COM is Trading Economics' market symbol for Gold in its historical-market examples.
  const url = new URL("https://api.tradingeconomics.com/markets/historical/GAC:COM");
  url.searchParams.set("c", apiKey);
  url.searchParams.set("d1", dateOnly(start));
  url.searchParams.set("d2", dateOnly(end));
  url.searchParams.set("f", "json");
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Trading Economics history HTTP ${res.status}`);
  const data = await res.json() as any[];
  const points = data.map(row => ({
    ts: parseTEDate(row.Date ?? row.date),
    price: Number(row.Close ?? row.close ?? row.Value ?? row.value),
    open: Number(row.Open ?? row.open),
    high: Number(row.High ?? row.high),
    low: Number(row.Low ?? row.low),
    source: "tradingeconomics" as const
  })).filter(x => Number.isFinite(x.ts) && Number.isFinite(x.price)).sort((a,b) => a.ts - b.ts);
  if (!points.length) throw new Error("Trading Economics returned no gold history");
  return downsample(points);
}

async function fetchStooqHistory(range: Exclude<HistoryRange, "1D">): Promise<WorldHistoryPoint[]> {
  const end = new Date();
  const start = range === "ALL" ? new Date(Date.UTC(1968, 0, 1)) : startForRange(range);
  const url = `https://stooq.com/q/d/l/?s=xauusd&d1=${compactDate(start)}&d2=${compactDate(end)}&i=d`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 GoldTrackerPWA/2.0" },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`Stooq history HTTP ${res.status}`);
  const csv = await res.text();
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("Stooq returned no history");
  const headers = lines[0].split(",").map(x => x.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name);
  const points = lines.slice(1).map(line => {
    const c = line.split(",");
    return {
      ts: Date.parse(c[idx("date")]),
      price: Number(c[idx("close")]),
      open: Number(c[idx("open")]),
      high: Number(c[idx("high")]),
      low: Number(c[idx("low")]),
      source: "stooq" as const
    };
  }).filter(x => Number.isFinite(x.ts) && Number.isFinite(x.price));
  return downsample(points);
}

export async function getExternalWorldHistory(range: Exclude<HistoryRange, "1D">) {
  return fetchStooqHistory(range);
}

export async function getStooqPreviousClose(): Promise<number | null> {
  const end = new Date();
  const start = new Date(Date.now() - 10 * 86400_000);
  const points = await fetchStooqHistory("1W").catch(() => []);
  if (!points.length) return null;
  const today = dateOnly(end);
  const completed = points.filter(p => dateOnly(new Date(p.ts)) < today);
  const completedLast = completed.length ? completed[completed.length - 1] : null;
  const previousPoint = points.length >= 2 ? points[points.length - 2] : null;
  const lastPoint = points.length ? points[points.length - 1] : null;
  return completedLast?.price ?? previousPoint?.price ?? lastPoint?.price ?? null;
}
