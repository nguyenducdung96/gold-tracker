import { useEffect, useRef, useState } from "react";
import { getDashboard, getVNHistory, getWorldHistory, subscribeDashboard } from "./api";
import type { Dashboard, VNQuote, WorldHistoryPoint, WorldRange } from "./types";
import { WorldCard } from "./components/WorldCard";
import { TradingViewGoldLive } from "./components/TradingViewGold";
import { WorldChart } from "./components/WorldChart";
import { VietnamTable } from "./components/VietnamTable";
import { VietnamChart } from "./components/VietnamChart";
import { PremiumCard } from "./components/PremiumCard";

const empty: Dashboard = {
  world: null,
  vietnam: [],
  providers: [],
  usdVnd: null,
  worldVndPerLuong: null,
  serverTime: ""
};

function appendLivePoint(points: WorldHistoryPoint[], point: WorldHistoryPoint) {
  const since = Date.now() - 24 * 3600_000;
  const filtered = points.filter(x => x.ts >= since);
  const last = filtered.length ? filtered[filtered.length - 1] : undefined;
  if (last && last.ts === point.ts) return filtered;
  if (last && point.ts < last.ts) return filtered;
  return [...filtered, point].slice(-5000);
}

export default function App() {
  const [dashboard, setDashboard] = useState<Dashboard>(empty);
  const [worldHistory, setWorldHistory] = useState<WorldHistoryPoint[]>([]);
  const [historySource, setHistorySource] = useState("local-live");
  const [range, setRange] = useState<WorldRange>("1D");
  const rangeRef = useRef<WorldRange>("1D");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selected, setSelected] = useState<VNQuote | null>(null);
  const [vnHistory, setVnHistory] = useState<any[]>([]);
  const [online, setOnline] = useState(navigator.onLine);

  async function loadRange(r: WorldRange) {
    setHistoryLoading(true);
    try {
      const h = await getWorldHistory(r);
      setWorldHistory(h.points);
      setHistorySource(h.source);
    } catch (e) {
      console.error(e);
      setWorldHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    getDashboard().then(d => {
      setDashboard(d);
      if (d.vietnam.length) setSelected(current => current ?? d.vietnam[0]);
    }).catch(console.error);

    const unsubscribe = subscribeDashboard((d) => {
      setDashboard(d);
      if (rangeRef.current === "1D" && d.world) {
        setWorldHistory(points => appendLivePoint(points, {
          ts: Date.parse(d.world!.receivedAt ?? d.world!.observedAt),
          price: d.world!.price,
          source: d.world!.source
        }));
      }
    });

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      unsubscribe();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    rangeRef.current = range;
    loadRange(range).catch(console.error);
  }, [range]);

  useEffect(() => {
    if (!selected) return;
    getVNHistory(selected.brand, selected.product, 24 * 30)
      .then(setVnHistory)
      .catch(console.error);
  }, [selected?.brand, selected?.product]);

  return (
    <main className="shell">
      <header>
        <div><h1>Gold Tracker</h1><p>Dashboard cá nhân · PWA · V7.1 Single Cloudflare</p></div>
        <div className={`status ${online ? "ok" : "bad"}`}>{online ? "● Online" : "● Offline"}</div>
      </header>

      <nav className="tabs">
        <button className="active">Vàng</button>
        <button disabled>Chứng khoán</button>
        <button disabled>FX</button>
        <button disabled>Hàng hóa</button>
        <button disabled>Tin tức</button>
      </nav>

      <TradingViewGoldLive/>

      <details className="referenceFeedDetails">
        <summary>Feed tính toán / premium (Gold-API) — mở để kiểm tra</summary>
        <WorldCard quote={dashboard.world}/>
      </details>

      <div className="historySectionLabel">
        <div>
          <div className="sectionTitle">History của ứng dụng</div>
          <div className="unit">
            Dữ liệu này độc lập với TradingView widget; dùng cho lưu trữ, premium và các overlay sau này.
          </div>
        </div>
      </div>

      <WorldChart
        data={worldHistory}
        range={range}
        source={historySource}
        loading={historyLoading}
        previousClose={dashboard.world?.previousClose}
        onRange={setRange}
      />
      <PremiumCard worldVndPerLuong={dashboard.worldVndPerLuong} usdVnd={dashboard.usdVnd}/>
      <VietnamTable
        rows={dashboard.vietnam}
        providers={dashboard.providers}
        worldVndPerLuong={dashboard.worldVndPerLuong}
        dataQuality={dashboard.dataQuality}
        onSelect={setSelected}
      />
      <VietnamChart selected={selected} data={vnHistory}/>

      <footer>
        V7.1: một Cloudflare Worker duy nhất serve PWA + /api/* + D1. TradingView OANDA:XAUUSD vẫn là realtime display; Gold-API chỉ là calculation/history feed.
      </footer>
    </main>
  );
}
