import { useEffect, useRef } from "react";

type WidgetProps = {
  scriptSrc: string;
  config: Record<string, unknown>;
  className?: string;
};

function TradingViewIframeWidget({ scriptSrc, config, className = "" }: WidgetProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    host.innerHTML = "";

    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    container.style.width = "100%";
    container.style.height = "100%";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.width = "100%";
    widget.style.height = "100%";
    container.appendChild(widget);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = scriptSrc;
    script.async = true;
    script.textContent = JSON.stringify(config);
    container.appendChild(script);

    host.appendChild(container);

    return () => {
      host.innerHTML = "";
    };
  }, [scriptSrc, JSON.stringify(config)]);

  return <div ref={ref} className={className} />;
}

export function TradingViewGoldLive() {
  const symbol = String(
    (import.meta as any).env?.VITE_TV_GOLD_SYMBOL ?? "OANDA:XAUUSD"
  );

  const symbolInfoConfig = {
    symbol,
    width: "100%",
    locale: "en",
    colorTheme: "dark",
    isTransparent: true
  };

  const chartConfig = {
    autosize: true,
    symbol,
    interval: "1",
    timezone: "Asia/Ho_Chi_Minh",
    theme: "dark",
    style: "1",
    locale: "en",
    backgroundColor: "rgba(7, 16, 29, 1)",
    gridColor: "rgba(30, 45, 67, 0.45)",
    hide_top_toolbar: false,
    hide_legend: false,
    save_image: false,
    allow_symbol_change: false,
    calendar: false,
    support_host: "https://www.tradingview.com"
  };

  return (
    <section className="card tvGoldCard">
      <div className="tvGoldHeader">
        <div>
          <div className="eyebrowRow">
            <div className="eyebrow">GOLD · XAU/USD</div>
            <span className="liveBadge live">● LIVE DISPLAY</span>
            <span className="freeBadge">FREE</span>
          </div>
          <div className="sectionTitle tvTitle">TradingView realtime · OANDA</div>
          <div className="unit">
            Giá + % thay đổi + chart được TradingView render trực tiếp. Không đi qua backend Gold-API.
          </div>
        </div>
        <div className="tvLinks">
          <a
            href="https://www.tradingview.com/symbols/XAUUSD/"
            target="_blank"
            rel="noreferrer"
          >
            Mở TradingView ↗
          </a>
          <a
            href="https://tradingeconomics.com/commodity/gold"
            target="_blank"
            rel="noreferrer"
          >
            So sánh Trading Economics ↗
          </a>
        </div>
      </div>

      <div className="tvQuoteWidget">
        <TradingViewIframeWidget
          scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js"
          config={symbolInfoConfig}
          className="tvSymbolInfo"
        />
      </div>

      <div className="tvChartWidget">
        <TradingViewIframeWidget
          scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
          config={chartConfig}
          className="tvAdvancedChart"
        />
      </div>

      <div className="tvNotice">
        <strong>Nguồn realtime hiển thị:</strong> TradingView widget · {symbol}.
        <span>
          Widget là display-only; ứng dụng không đọc/export giá từ iframe.
        </span>
      </div>
    </section>
  );
}
