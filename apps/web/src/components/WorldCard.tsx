import type { WorldGoldQuote } from "../types";

function signed(value: number, digits = 2) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function WorldCard({ quote }: { quote: WorldGoldQuote | null }) {
  if (!quote) return <section className="card">Đang tải XAU/USD...</section>;

  const pct = quote.changePct ?? null;
  const delta = quote.changeAbs ?? (
    quote.previousClose != null ? quote.price - quote.previousClose : null
  );
  const cls = pct == null ? "neutral" : pct > 0 ? "positive" : pct < 0 ? "negative" : "neutral";
  const ageMs = Date.now() - Date.parse(quote.receivedAt ?? quote.observedAt);
  const live = ageMs < 20_000;
  const sourceLabel = quote.source === "tradingeconomics" ? "Trading Economics" : "Gold-API";
  const previousSource = quote.previousCloseSource === "tradingeconomics"
    ? "Trading Economics"
    : quote.previousCloseSource === "stooq"
      ? "Stooq fallback"
      : quote.previousCloseSource === "local-db"
        ? "Local DB fallback"
        : null;

  return (
    <section className="card worldHero">
      <div className="quoteMain">
        <div className="eyebrowRow">
          <div className="eyebrow">REFERENCE FEED · XAU/USD</div>
          <span className={`liveBadge ${live ? "live" : "stale"}`}>{live ? "● CALC FEED" : "● STALE"}</span>
        </div>

        <div className={`price ${cls}`}>
          ${quote.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        <div className={`marketMove ${cls}`}>
          {pct == null ? (
            <span>Chưa lấy được giá đóng cửa phiên trước</span>
          ) : (
            <>
              <strong>{pct > 0 ? "▲" : pct < 0 ? "▼" : "●"} {signed(pct)}%</strong>
              {delta != null && <span>{signed(delta)} USD</span>}
              <span>so với phiên trước</span>
            </>
          )}
        </div>

        <div className="quoteMetaGrid">
          <div>
            <span>Previous close</span>
            <strong>{quote.previousClose != null ? `$${quote.previousClose.toFixed(2)}` : "—"}</strong>
            {previousSource && <small>{previousSource}</small>}
          </div>
          <div>
            <span>Calculation source</span>
            <strong>{sourceLabel}</strong>
            <small>dùng cho premium/history, không phải giá hiển thị chính</small>
          </div>
        </div>
      </div>

      <div className="sourceBox">
        <span>Source time: {new Date(quote.observedAt).toLocaleTimeString("vi-VN")}</span>
        <span>Received: {new Date(quote.receivedAt ?? quote.observedAt).toLocaleTimeString("vi-VN")}</span>
        <a href={quote.sourceUrl} target="_blank" rel="noreferrer">Mở nguồn giá ↗</a>
        <span className="calcFeedNote">Giá này có thể lệch TradingView/Trading Economics vì khác feed.</span>
      </div>
    </section>
  );
}
