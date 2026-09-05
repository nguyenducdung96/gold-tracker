import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from "recharts";
import type { WorldHistoryPoint, WorldRange } from "../types";

const RANGES: WorldRange[] = ["1D","1W","1M","6M","1Y","5Y","10Y","25Y","50Y","ALL"];

function tick(ts: number, range: WorldRange) {
  const d = new Date(ts);
  if (range === "1D") return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  if (["1W","1M","6M","1Y"].includes(range)) return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  return String(d.getFullYear());
}

function sourceLabel(source: string) {
  if (source === "tradingeconomics") return "Trading Economics";
  if (source === "stooq") return "Stooq XAU/USD fallback";
  if (source === "local-live" || source === "local") return "realtime samples từ backend";
  return source;
}

export function WorldChart({ data, range, source, loading, previousClose, onRange }: {
  data: WorldHistoryPoint[];
  range: WorldRange;
  source: string;
  loading: boolean;
  previousClose?: number | null;
  onRange: (r: WorldRange) => void;
}) {
  const first = data[0]?.price;
  const last = data[data.length - 1]?.price;
  const prices = data.map(x => Number(x.price)).filter(Number.isFinite);
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;
  const periodPct = first && last ? ((last - first) / first) * 100 : null;
  const isUp = periodPct == null ? true : periodPct >= 0;
  const trendClass = periodPct == null ? "neutral" : isUp ? "positive" : "negative";
  const stroke = isUp ? "#22c55e" : "#ef4444";
  const fill = isUp ? "#22c55e" : "#ef4444";

  return (
    <section className="card marketChartCard">
      <div className="chartHeader">
        <div>
          <div className="sectionTitle">XAU/USD · {range === "ALL" ? "All" : range}</div>
          <div className="unit">Nguồn chart: {sourceLabel(source)}</div>
        </div>
        {periodPct != null && (
          <div className={`periodMove ${trendClass}`}>
            <strong>{periodPct >= 0 ? "+" : ""}{periodPct.toFixed(2)}%</strong>
            <span>{first?.toFixed(2)} → {last?.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="rangeBar">
        {RANGES.map(r => (
          <button key={r} className={r === range ? "selected" : ""} onClick={() => onRange(r)}>
            {r === "ALL" ? "All" : r}
          </button>
        ))}
      </div>

      {range === "1D" && high != null && low != null && (
        <div className="dayStats">
          <span>Low <strong>${low.toFixed(2)}</strong></span>
          <span>High <strong>${high.toFixed(2)}</strong></span>
          <span>Samples <strong>{data.length}</strong></span>
        </div>
      )}

      <div className="chart">
        {loading ? (
          <div className="empty">Đang tải dữ liệu {range}...</div>
        ) : data.length < 2 ? (
          <div className="empty">Đang tích lũy realtime samples cho khung {range}...</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.10} vertical={false}/>
              <XAxis dataKey="ts" tickFormatter={(x) => tick(Number(x), range)} minTickGap={35}/>
              <YAxis domain={["auto", "auto"]} width={70} tickFormatter={(x) => `$${Math.round(Number(x))}`}/>
              <Tooltip
                labelFormatter={(x) => new Date(Number(x)).toLocaleString("vi-VN")}
                formatter={(v: number) => [`$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Gold"]}
              />
              {range === "1D" && previousClose != null && (
                <ReferenceLine y={previousClose} stroke="#94a3b8" strokeDasharray="5 5" label={{ value: "Prev close", position: "insideTopRight", fill: "#94a3b8", fontSize: 11 }}/>
              )}
              <Area
                type="monotone"
                dataKey="price"
                stroke={stroke}
                fill={fill}
                fillOpacity={0.12}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
