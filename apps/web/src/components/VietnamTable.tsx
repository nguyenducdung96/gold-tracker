import type { ProviderStatus, VNQuote } from "../types";
const fmt = new Intl.NumberFormat("vi-VN");
const label = (p: "bar" | "ring") => p === "bar" ? "Vàng miếng" : "Nhẫn trơn 9999";

function statusText(p: ProviderStatus) {
  if (p.qualityState === "suspect") {
    const source = p.state === "fallback" ? "Fallback" : p.state === "live" ? "Official" : "Cache";
    return { mark: "⚠", text: `${source} · Suspect`, cls: "suspect" };
  }
  if (p.state === "live") return { mark: "●", text: "Official", cls: "live" };
  if (p.state === "fallback") return { mark: "◆", text: "Fallback", cls: "fallback" };
  if (p.stale) return { mark: "◷", text: "Stale", cls: "stale" };
  return { mark: "⚠", text: "Error", cls: "missing" };
}

function ageText(iso: string | null) {
  if (!iso) return "chưa có dữ liệu";
  const sec = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (sec < 60) return `${sec}s trước`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

export function VietnamTable({ rows, providers, worldVndPerLuong, dataQuality, onSelect }: {
  rows: VNQuote[];
  providers: ProviderStatus[];
  worldVndPerLuong: number | null;
  dataQuality?: {
    config: { consensusBandPct: number; outlierThresholdPct: number; maxSpreadPct: number; minConsensusSize: number };
    summaries: { product: "bar" | "ring"; peerMedianBuy: number | null; peerMedianSell: number | null; consensusSize: number; totalSize: number }[];
    suspectCount: number;
  };
  onSelect: (row: VNQuote) => void;
}) {
  const providerMap = new Map(providers.map(p => [p.brand, p]));
  return (
    <section className="card">
      <div className="sectionTitle">Giá vàng Việt Nam</div>
      <div className="unit">VNĐ / lượng · click một dòng để xem chart lịch sử</div>

      <div className="providerChips">
        {providers.map(p => {
          const st = statusText(p);
          const title = [
            `${p.brand}: ${st.text}`,
            `Cập nhật thành công: ${p.lastSuccessAt ? new Date(p.lastSuccessAt).toLocaleString("vi-VN") : "chưa có"}`,
            p.suspectProducts?.length ? `Dữ liệu nghi vấn: ${p.suspectProducts.join(", ")}` : "",
            p.error ? `Chi tiết: ${p.error}` : ""
          ].filter(Boolean).join("\n");
          return <a key={p.brand} href={p.homeUrl} target="_blank" rel="noreferrer" title={title} className={`providerChip ${st.cls}`}>
            {p.brand} {st.mark}<span className="chipSource">{st.text}</span>
          </a>;
        })}
      </div>

      <div className="providerLegend">
        <span>● official</span><span>◆ fallback</span><span>◷ cache cũ</span><span>⚠ suspect/error</span>
      </div>

      {dataQuality && <div className={`qualityBanner ${dataQuality.suspectCount ? "warn" : "ok"}`}>
        <strong>{dataQuality.suspectCount ? `⚠ ${dataQuality.suspectCount} quote cần kiểm tra` : "✓ Không phát hiện outlier"}</strong>
        <span>
          Outlier chỉ là cảnh báo tương đối: lệch &gt; {dataQuality.config.outlierThresholdPct}% so với cụm đồng thuận tối thiểu {dataQuality.config.minConsensusSize} hãng. Quote suspect vẫn hiển thị nhưng không được ghi vào history và không dùng tính premium.
        </span>
      </div>}

      <div className="tableWrap">
        <table>
          <thead><tr><th>Hãng</th><th>Sản phẩm</th><th>Mua</th><th>Bán</th><th>Spread</th><th>Premium vs TG (giá bán)</th><th>Quality</th><th>Nguồn / cập nhật</th></tr></thead>
          <tbody>
            {rows.map((r, idx) => {
              const suspect = r.qualityState === "suspect";
              const premium = !suspect && worldVndPerLuong ? ((r.sell / worldVndPerLuong) - 1) * 100 : null;
              const status = providerMap.get(r.brand);
              const isStale = status?.state === "error";
              return <tr key={`${r.brand}-${r.product}-${idx}`} onClick={() => onSelect(r)} className={`${isStale ? "staleRow" : ""} ${suspect ? "suspectRow" : ""}`}>
                <td><strong>{r.brand}</strong>{isStale && <small className="staleLabel">CACHE</small>}</td>
                <td><div>{label(r.product)}</div><small>{r.productName}</small></td>
                <td>{fmt.format(r.buy)}</td><td>{fmt.format(r.sell)}</td><td>{fmt.format(r.sell-r.buy)}</td>
                <td className={premium != null && premium >= 0 ? "positive" : premium != null ? "negative" : "neutral"}>{premium == null ? "—" : `${premium >= 0 ? "+" : ""}${premium.toFixed(2)}%`}</td>
                <td>
                  {suspect ? <div className="qualitySuspect" title={(r.qualityReasons ?? []).join("\n")}>
                    <strong>⚠ SUSPECT</strong>
                    {r.peerDeviationPct != null && <small>{r.peerDeviationPct >= 0 ? "+" : ""}{r.peerDeviationPct.toFixed(2)}% vs peers</small>}
                    {(r.qualityReasons ?? []).slice(0, 1).map(reason => <small key={reason}>{reason}</small>)}
                  </div> : <span className="qualityOk">✓ OK</span>}
                </td>
                <td>
                  <a href={r.sourceUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                    {r.sourceKind === "fallback"
                      ? r.verificationState === "cross-verified"
                        ? "Fallback verified"
                        : "Fallback"
                      : "Official"} ↗
                  </a>
                  {r.sourceKind === "fallback" && (
                    <small className={r.verificationState === "cross-verified" ? "qualityOk" : "qualitySuspect"}>
                      {r.verificationState === "cross-verified"
                        ? `✓ đối chiếu ${r.verificationSources?.length ?? 2} nguồn`
                        : "⚠ chưa cross-check đủ nguồn"}
                    </small>
                  )}
                  <small>{ageText(r.observedAt)}</small>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && <div className="empty">Chưa lấy được bảng giá. Xem chip provider hoặc /api/gold/dashboard để biết lỗi cụ thể.</div>}
    </section>
  );
}
