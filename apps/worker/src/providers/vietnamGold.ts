import * as cheerio from "cheerio";
import type { VietnamGoldQuote } from "../types.js";

type Brand = "SJC" | "PNJ" | "DOJI" | "BTMC" | "PHUQUY";
type Product = "bar" | "ring";
type UnitHint = "thousand_per_chi" | "thousand_per_luong" | "vnd_per_chi" | "vnd_per_luong";

export type VietnamProviderStatus = {
  brand: Brand;
  url: string;
  homeUrl: string;
  state: "live" | "fallback" | "error";
  available: boolean;
  sourceKind: "official" | "fallback" | null;
  sourceLabel: string | null;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  error: string | null;
  diagnostics?: string[];
  qualityState?: "ok" | "suspect" | null;
  suspectProducts?: Product[];
};

type ProviderResult = { rows: VietnamGoldQuote[]; status: VietnamProviderStatus };
type Provider = {
  brand: Brand;
  officialUrl: string;
  homeUrl: string;
  fallbackUrls?: string[];
  unitHint: UnitHint;
};

const PROVIDERS: Provider[] = [
  {
    brand: "SJC",
    officialUrl: "https://www.sjc.com.vn/gia-vang-online",
    homeUrl: "https://www.sjc.com.vn/",
    fallbackUrls: [
      "https://vietnambiz.vn/gia-vang-hom-nay.html",
      "https://vietnambiz.vn/gia-vang-nhan.html"
    ],
    unitHint: "vnd_per_luong"
  },
  {
    brand: "PNJ",
    officialUrl: "https://www.pnj.com.vn/site/gia-vang",
    homeUrl: "https://www.pnj.com.vn/",
    fallbackUrls: ["https://vietnambiz.vn/gia-vang-pnj.html"],
    unitHint: "thousand_per_chi"
  },
  {
    brand: "DOJI",
    officialUrl: "https://banggia.doji.vn/",
    homeUrl: "https://doji.vn/",
    fallbackUrls: [
      "https://webgia.tv/gia-vang/doji",
      "https://baohatinh.vn/tv/gia-vang",
      "https://baonghean.vn/gia-vang-hom-nay",
      "https://vietnambiz.vn/gia-vang-doji.html",
      "https://vietnambiz.vn/gia-vang-hom-nay.html"
    ],
    unitHint: "vnd_per_luong"
  },
  {
    brand: "BTMC",
    officialUrl: "https://btmc.vn/Home/BGiaVang",
    homeUrl: "https://btmc.vn/",
    unitHint: "thousand_per_luong"
  },
  {
    brand: "PHUQUY",
    officialUrl: "https://phuquygroup.vn/giavang",
    homeUrl: "https://phuquygroup.vn/",
    unitHint: "vnd_per_chi"
  }
];

const FETCH_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36",
  "accept-language": "vi-VN,vi;q=0.9,en;q=0.7",
  accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "cache-control": "no-cache",
  pragma: "no-cache"
};

function nowIso() { return new Date().toISOString(); }
function cleanText(s: string) { return s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function noAccent(s: string) { return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const s = value.replace(/[^\d.,-]/g, "").trim();
  if (!s || s === "-") return null;

  // Editorial sources often use 144,40 / 144.40 million VND per lượng.
  const decimalLike = /^\d{2,3}[.,]\d{1,2}$/.test(s);
  if (decimalLike) {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n * 1_000_000 : null;
  }
  const n = Number(s.replace(/[.,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toVndPerLuong(value: number, preferred: UnitHint): number {
  if (value >= 50_000_000) return preferred === "vnd_per_chi" ? value * 10 : value;
  if (value >= 5_000_000) return value * 10;
  if (value >= 50_000) return value * 1000;
  if (value >= 5_000) return value * 10_000;
  if (value >= 50 && value <= 300) return value * 1_000_000;
  return preferred === "thousand_per_chi" ? value * 10_000 : value * 1000;
}


function priceTokensFromCell(text: string, unitHint: UnitHint): number[] {
  // Important for rows such as "145.500 ▲1.000":
  // parse the FIRST price token, not "145.5001.000" as one number.
  const tokens = cleanText(text).match(
    /\d{1,3}(?:[.,]\d{3}){1,3}|\d{2,3}[.,]\d{1,2}|\d{5,9}/g
  ) ?? [];

  const values: number[] = [];
  for (const token of tokens) {
    const raw = parseNumber(token);
    if (raw == null) continue;
    const normalized = toVndPerLuong(raw, unitHint);
    if (normalized >= 50_000_000 && normalized <= 300_000_000) {
      values.push(normalized);
    }
  }
  return values;
}

function firstPriceFromCell(text: string, unitHint: UnitHint): number | null {
  const values = priceTokensFromCell(text, unitHint);
  return values.length ? values[0] : null;
}

function pctDistance(a: number, b: number): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b) / ((a + b) / 2) * 100;
}

function classifyProduct(name: string): Product | null {
  const n = noAccent(name);
  if (/nhan\s*(tron|tron tron)|hung thinh vuong|rong thang long|nhan.*999/.test(n)) return "ring";
  if (/vang mieng|sjc\s*(1l|5 chi|0\.5|999)|sjc.*(1kg|10l)|mieng doji/.test(n)) return "bar";
  if (n.includes("sjc") && !n.includes("nhan")) return "bar";
  return null;
}

function brandMatches(brand: Brand, text: string): boolean {
  const n = noAccent(text);
  switch (brand) {
    case "SJC": return n.includes("sjc") || n.includes("vang bac da quy sai gon");
    case "PNJ": return n.includes("pnj") || n.includes("phu nhuan");
    case "DOJI": return n.includes("doji") || n.includes("hung thinh vuong");
    case "BTMC": return n.includes("btmc") || n.includes("bao tin minh chau") || n.includes("rong thang long");
    case "PHUQUY": return n.includes("phu quy") || n.includes("phuquy");
  }
}

function desiredProductName(brand: Brand, product: Product): RegExp[] {
  if (product === "bar") {
    if (brand === "DOJI") return [/vang mieng doji/i, /vang mieng sjc/i, /sjc.*1l/i, /sjc/i];
    return [/vang mieng sjc/i, /sjc.*1l/i, /sjc/i];
  }
  switch (brand) {
    case "SJC": return [/nhan.*sjc/i, /nhan.*999/i];
    case "PNJ": return [/nhan tron pnj/i, /nhan tron/i];
    case "DOJI": return [/hung thinh vuong/i, /nhan tron.*9999/i, /nhan tron/i];
    case "BTMC": return [/nhan tron tron bao tin minh chau/i, /rong thang long/i, /nhan tron/i];
    case "PHUQUY": return [/nhan tron phu quy/i, /nhan tron/i];
  }
}

function makeQuote(
  p: Provider,
  product: Product,
  productName: string,
  buy: number,
  sell: number,
  sourceUrl: string,
  sourceKind: "official" | "fallback"
): VietnamGoldQuote | null {
  if (!Number.isFinite(buy) || !Number.isFinite(sell)) return null;
  if (buy < 50_000_000 || buy > 300_000_000 || sell < 50_000_000 || sell > 300_000_000 || sell < buy) return null;
  return {
    brand: p.brand,
    product,
    productName: cleanText(productName),
    buy,
    sell,
    currency: "VND",
    unit: "luong",
    sourceUrl,
    sourceKind,
    observedAt: nowIso()
  };
}

async function fetchText(
  url: string,
  extraHeaders: Record<string, string> = {}
): Promise<{ text: string; contentType: string; finalUrl: string; status: number }> {
  const res = await fetch(url, {
    headers: { ...FETCH_HEADERS, ...extraHeaders },
    redirect: "follow",
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return {
    text: await res.text(),
    contentType: res.headers.get("content-type") ?? "",
    finalUrl: res.url || url,
    status: res.status
  };
}

function rowsFromHtml(html: string): string[][] {
  const $ = cheerio.load(html);
  const rows: string[][] = [];
  $("tr").each((_, tr) => {
    const cells = $(tr).find("th,td").map((__, el) => cleanText($(el).text())).get().filter(Boolean);
    if (cells.length >= 3) rows.push(cells);
  });
  return rows;
}

function pageText(html: string): string {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg").remove();
  return cleanText($.root().text());
}

function quoteCandidatesFromRows(
  p: Provider,
  rows: string[][],
  sourceUrl: string,
  sourceKind: "official" | "fallback"
): VietnamGoldQuote[] {
  const candidates: VietnamGoldQuote[] = [];
  for (const cells of rows) {
    const joined = cleanText(cells.join(" "));
    const product = classifyProduct(joined);
    if (!product) continue;
    if (sourceKind === "fallback" && !brandMatches(p.brand, joined) && !sourceUrl.toLowerCase().includes(p.brand.toLowerCase())) continue;

    const plausible: number[] = [];
    for (const c of cells) {
      const raw = parseNumber(c);
      if (raw == null) continue;
      const normalized = toVndPerLuong(raw, p.unitHint);
      if (normalized >= 50_000_000 && normalized <= 300_000_000) plausible.push(normalized);
    }
    if (plausible.length < 2) continue;
    const name = cells.find(c => classifyProduct(c) != null) ?? cells.slice(0, 2).join(" ");
    const q = makeQuote(p, product, name, plausible[0], plausible[1], sourceUrl, sourceKind);
    if (q) candidates.push(q);
  }
  return candidates;
}

function namedCandidatesFromText(
  p: Provider,
  text: string,
  sourceUrl: string,
  sourceKind: "official" | "fallback"
): VietnamGoldQuote[] {
  const specs: { product: Product; labels: RegExp[] }[] = p.brand === "PNJ" ? [
    { product: "bar", labels: [/Vàng\s*miếng\s*SJC\s*999(?:[.,]9)?/iu, /Vàng\s*miếng\s*SJC/iu] },
    { product: "ring", labels: [/Nhẫn\s*Trơn\s*PNJ\s*999(?:[.,]9)?/iu, /Nhẫn\s*Trơn\s*PNJ/iu] }
  ] : p.brand === "DOJI" ? [
    { product: "bar", labels: [/Vàng\s*miếng\s*DOJI\s*lẻ/iu, /Vàng\s*SJC\s*1L[^\d]{0,20}/iu, /Vàng\s*miếng\s*SJC/iu] },
    { product: "ring", labels: [/Nhẫn\s*Tròn\s*9999\s*Hưng\s*Thịnh\s*Vượng/iu, /Hưng\s*Thịnh\s*Vượng/iu] }
  ] : p.brand === "SJC" ? [
    { product: "bar", labels: [/Vàng\s*SJC\s*1L[^\d]{0,20}/iu, /Vàng\s*miếng\s*SJC/iu] },
    { product: "ring", labels: [/Vàng\s*nhẫn\s*SJC\s*99(?:[,.]?99)?%?/iu, /Nhẫn\s*SJC\s*9999/iu] }
  ] : [];

  const out: VietnamGoldQuote[] = [];
  for (const spec of specs) {
    for (const label of spec.labels) {
      const m = label.exec(text);
      if (!m || m.index == null) continue;
      const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 240);
      const tokens = tail.match(/\d{2,3}(?:[.,]\d{3}){1,3}|\d{2,3}[.,]\d{1,2}|\d{5,9}/g) ?? [];
      const values = tokens
        .map(parseNumber)
        .filter((x): x is number => x != null)
        .map(x => toVndPerLuong(x, p.unitHint))
        .filter(x => x >= 50_000_000 && x <= 300_000_000);
      if (values.length >= 2) {
        const q = makeQuote(p, spec.product, m[0], values[0], values[1], sourceUrl, sourceKind);
        if (q) out.push(q);
        break;
      }
    }
  }
  return out;
}

function pickBest(p: Provider, candidates: VietnamGoldQuote[]): VietnamGoldQuote[] {
  const result: VietnamGoldQuote[] = [];
  for (const product of ["bar", "ring"] as const) {
    const patterns = desiredProductName(p.brand, product);
    const rows = candidates.filter(x => x.product === product);
    rows.sort((a, b) => {
      const aa = noAccent(a.productName);
      const bb = noAccent(b.productName);
      const sa = patterns.reduce((s, re, i) => s + (re.test(aa) ? 100 - i * 10 : 0), 0);
      const sb = patterns.reduce((s, re, i) => s + (re.test(bb) ? 100 - i * 10 : 0), 0);
      return sb - sa;
    });
    if (rows[0]) result.push(rows[0]);
  }
  return result;
}

function objectValue(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in obj && obj[key] != null) return obj[key];
    const found = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    if (found && obj[found] != null) return obj[found];
  }
  return null;
}

function quotesFromJson(p: Provider, root: unknown, sourceUrl: string): VietnamGoldQuote[] {
  const out: VietnamGoldQuote[] = [];
  const seen = new Set<unknown>();
  function walk(value: unknown, depth = 0) {
    if (depth > 14 || value == null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const x of value) walk(x, depth + 1);
      return;
    }
    const obj = value as Record<string, unknown>;
    const rawName = objectValue(obj, ["TypeName", "Name", "ProductName", "GoldName", "title", "label", "type_name", "product_name"]);
    const rawBuy = objectValue(obj, ["Buy", "buy", "BuyPrice", "buyPrice", "buy_price", "Mua", "buyingPrice"]);
    const rawSell = objectValue(obj, ["Sell", "sell", "SellPrice", "sellPrice", "sell_price", "Ban", "sellingPrice"]);
    if (rawName != null && rawBuy != null && rawSell != null) {
      const name = cleanText(String(rawName));
      const product = classifyProduct(name);
      const b0 = parseNumber(rawBuy);
      const s0 = parseNumber(rawSell);
      if (product && b0 != null && s0 != null) {
        const q = makeQuote(p, product, name, toVndPerLuong(b0, p.unitHint), toVndPerLuong(s0, p.unitHint), sourceUrl, "official");
        if (q) out.push(q);
      }
    }
    for (const x of Object.values(obj)) walk(x, depth + 1);
  }
  walk(root);
  return out;
}

function jsonObjectsFromHtml(html: string): unknown[] {
  const $ = cheerio.load(html);
  const objects: unknown[] = [];
  $("script").each((_, script) => {
    const type = ($(script).attr("type") ?? "").toLowerCase();
    const id = ($(script).attr("id") ?? "").toLowerCase();
    const text = $(script).html()?.trim() ?? "";
    if (!text) return;
    if (type.includes("json") || id === "__next_data__") {
      try { objects.push(JSON.parse(text)); } catch {}
    }
  });
  return objects;
}

function safeJson(text: string): unknown | null {
  try { return JSON.parse(text); } catch {}
  const firstObject = text.indexOf("{");
  const firstArray = text.indexOf("[");
  const start = [firstObject, firstArray].filter(x => x >= 0).sort((a, b) => a - b)[0];
  if (start == null) return null;
  try { return JSON.parse(text.slice(start)); } catch { return null; }
}

async function fetchSjcOfficial(p: Provider, diagnostics: string[]): Promise<VietnamGoldQuote[]> {
  // SJC's visible page is dynamic. Try the public price-service variants first.
  const endpoints = [
    "https://www.sjc.com.vn/GoldPrice/Services/PriceService.ashx",
    "https://sjc.com.vn/GoldPrice/Services/PriceService.ashx",
    "https://www.sjc.com.vn/GoldPrice/GoldPriceService.ashx?action=GetCurrentGoldPrice&type=SJC",
    "https://sjc.com.vn/GoldPrice/GoldPriceService.ashx?action=GetCurrentGoldPrice&type=SJC"
  ];
  for (const url of endpoints) {
    try {
      const { text } = await fetchText(url, {
        referer: p.officialUrl,
        origin: "https://www.sjc.com.vn",
        "x-requested-with": "XMLHttpRequest"
      });
      const data = safeJson(text);
      if (data != null) {
        const picked = pickBest(p, quotesFromJson(p, data, p.officialUrl));
        diagnostics.push(`${url}: JSON ${picked.length}/2`);
        if (picked.length >= 2) return picked;
      } else {
        diagnostics.push(`${url}: non-JSON response`);
      }
    } catch (e) {
      diagnostics.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  try {
    const { text } = await fetchText(p.officialUrl, { referer: p.homeUrl });
    const candidates = [
      ...quoteCandidatesFromRows(p, rowsFromHtml(text), p.officialUrl, "official"),
      ...namedCandidatesFromText(p, pageText(text), p.officialUrl, "official"),
      ...jsonObjectsFromHtml(text).flatMap(x => quotesFromJson(p, x, p.officialUrl))
    ];
    const picked = pickBest(p, candidates);
    diagnostics.push(`official page: ${picked.length}/2`);
    if (picked.length >= 2) return picked;
  } catch (e) {
    diagnostics.push(`official page: ${e instanceof Error ? e.message : String(e)}`);
  }
  throw new Error("SJC official endpoints/page returned no complete bar+ring pair");
}

async function fetchPnjOfficial(p: Provider, diagnostics: string[]): Promise<VietnamGoldQuote[]> {
  const urls = [
    `${p.officialUrl}?r=${Date.now()}`,
    p.officialUrl
  ];
  for (const url of urls) {
    try {
      const { text } = await fetchText(url, { referer: p.homeUrl });
      const candidates = [
        ...quoteCandidatesFromRows(p, rowsFromHtml(text), p.officialUrl, "official"),
        ...namedCandidatesFromText(p, pageText(text), p.officialUrl, "official"),
        ...jsonObjectsFromHtml(text).flatMap(x => quotesFromJson(p, x, p.officialUrl))
      ];
      const picked = pickBest(p, candidates);
      diagnostics.push(`${url}: ${picked.length}/2`);
      if (picked.length >= 2) return picked;
    } catch (e) {
      diagnostics.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error("PNJ official parser returned no complete bar+ring pair");
}

async function fetchDojiOfficial(p: Provider, diagnostics: string[]): Promise<VietnamGoldQuote[]> {
  // Try new app first, then legacy endpoints/pages that DOJI historically kept online.
  const urls = [
    p.officialUrl,
    "https://giavang.doji.vn/",
    "http://giavang.doji.vn/"
  ];
  for (const url of urls) {
    try {
      const { text } = await fetchText(url, { referer: p.homeUrl });
      const tableRows = rowsFromHtml(text);
      const candidates = [
        ...exactDojiCandidatesFromRows(p, tableRows, p.officialUrl, "official"),
        ...quoteCandidatesFromRows(p, tableRows, p.officialUrl, "official"),
        ...jsonObjectsFromHtml(text).flatMap(x => quotesFromJson(p, x, p.officialUrl))
      ];
      const picked = pickBest(p, candidates);
      diagnostics.push(`${url}: ${picked.length}/2`);
      if (picked.length >= 2) return picked;

      // Harvest likely API URLs from JS/HTML and try only same-domain HTTP(S) endpoints.
      const apiUrls = Array.from(new Set(
        (text.match(/https?:\\?\/\\?\/[^"'\s<>]+/g) ?? [])
          .map(x => x.replaceAll("\\/", "/"))
          .filter(x => /doji\.vn/i.test(x) && /(api|price|gold|banggia|gia-vang)/i.test(x))
          .slice(0, 12)
      ));
      for (const apiUrl of apiUrls) {
        try {
          const r = await fetchText(apiUrl, { referer: p.officialUrl, accept: "application/json,text/plain,*/*" });
          const data = safeJson(r.text);
          if (data == null) continue;
          const q = pickBest(p, quotesFromJson(p, data, p.officialUrl));
          diagnostics.push(`discovered ${apiUrl}: ${q.length}/2`);
          if (q.length >= 2) return q;
        } catch (e) {
          diagnostics.push(`discovered API failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } catch (e) {
      diagnostics.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error("DOJI official app/legacy pages returned no complete bar+ring pair");
}

async function fetchGenericOfficial(p: Provider, diagnostics: string[]): Promise<VietnamGoldQuote[]> {
  const { text } = await fetchText(p.officialUrl, { referer: p.homeUrl });
  const candidates = [
    ...quoteCandidatesFromRows(p, rowsFromHtml(text), p.officialUrl, "official"),
    ...namedCandidatesFromText(p, pageText(text), p.officialUrl, "official")
  ];
  const picked = pickBest(p, candidates);
  diagnostics.push(`${p.officialUrl}: ${picked.length}/2`);
  if (picked.length < 2) throw new Error(`${p.brand} official parser found ${picked.length}/2 products`);
  return picked;
}


function exactDojiCandidatesFromRows(
  p: Provider,
  rows: string[][],
  sourceUrl: string,
  sourceKind: "official" | "fallback"
): VietnamGoldQuote[] {
  const out: VietnamGoldQuote[] = [];

  for (const cells of rows) {
    const normalizedCells = cells.map(cleanText);
    const rowText = noAccent(normalizedCells.join(" "));

    let product: Product | null = null;
    let displayName = "";

    // Strict matching. Do not accept generic "DOJI" or nearby numbers.
    if (
      /nhan\s*tron\s*9999?.*hung\s*thinh\s*vuong/.test(rowText) ||
      /hung\s*thinh\s*vuong/.test(rowText)
    ) {
      product = "ring";
      displayName =
        normalizedCells.find(c => /Hưng\s*Thịnh\s*Vượng/i.test(c)) ??
        "Nhẫn Tròn 9999 Hưng Thịnh Vượng";
    } else if (
      /(^|\s)sjc(\s|$)/.test(rowText) ||
      /vang\s*mieng\s*sjc/.test(rowText) ||
      /sjc\s*-\s*ban\s*le/.test(rowText)
    ) {
      // Exclude any SJC ring row.
      if (/nhan/.test(rowText)) continue;
      product = "bar";
      displayName =
        normalizedCells.find(c => /SJC/i.test(c)) ??
        "Vàng miếng SJC";
    }

    if (!product) continue;

    // Find product-name cell and read prices only from following cells.
    // This prevents STT, daily change, or unrelated values from becoming buy/sell.
    let nameIndex = normalizedCells.findIndex(c => {
      const n = noAccent(c);
      return product === "ring"
        ? /hung\s*thinh\s*vuong/.test(n)
        : (/sjc/.test(n) && !/nhan/.test(n));
    });
    if (nameIndex < 0) nameIndex = 0;

    const after = normalizedCells.slice(nameIndex + 1);
    const cellPrices = after
      .map(c => firstPriceFromCell(c, p.unitHint))
      .filter((x): x is number => x != null);

    // Some tables put name + buy + sell in one combined text cell.
    let buy = cellPrices[0] ?? null;
    let sell = cellPrices[1] ?? null;
    if (buy == null || sell == null) {
      const all = priceTokensFromCell(
        normalizedCells.slice(nameIndex).join(" "),
        p.unitHint
      );
      buy = buy ?? all[0] ?? null;
      sell = sell ?? all[1] ?? null;
    }

    if (buy == null || sell == null) continue;
    const q = makeQuote(
      p,
      product,
      displayName,
      buy,
      sell,
      sourceUrl,
      sourceKind
    );
    if (q) out.push(q);
  }

  return out;
}

type FallbackObservation = {
  url: string;
  quote: VietnamGoldQuote;
};

function verifyDojiFallback(
  observations: FallbackObservation[],
  diagnostics: string[]
): VietnamGoldQuote[] {
  const verifyPct = Math.max(
    0.5,
    Number(process.env.VN_FALLBACK_VERIFY_PCT ?? 5)
  );
  const minSources = Math.max(
    2,
    Number(process.env.VN_FALLBACK_MIN_SOURCES ?? 2)
  );

  const result: VietnamGoldQuote[] = [];

  for (const product of ["bar", "ring"] as const) {
    const items = observations.filter(x => x.quote.product === product);
    if (!items.length) continue;

    // Find the largest agreement cluster using SELL as primary comparison
    // and BUY as secondary comparison.
    let bestCluster: FallbackObservation[] = [];
    for (const anchor of items) {
      const cluster = items.filter(x =>
        pctDistance(x.quote.sell, anchor.quote.sell) <= verifyPct &&
        pctDistance(x.quote.buy, anchor.quote.buy) <= verifyPct
      );
      if (cluster.length > bestCluster.length) bestCluster = cluster;
    }

    // If 2+ independent URLs agree, choose the median-ish quote.
    if (bestCluster.length >= minSources) {
      const sorted = [...bestCluster].sort(
        (a, b) => a.quote.sell - b.quote.sell
      );
      const chosen = sorted[Math.floor((sorted.length - 1) / 2)];
      const sources = Array.from(new Set(bestCluster.map(x => x.url)));

      result.push({
        ...chosen.quote,
        sourceUrl: chosen.url,
        verificationState: "cross-verified",
        verificationSources: sources
      });

      diagnostics.push(
        `DOJI ${product}: fallback cross-verified ${bestCluster.length} sources within ${verifyPct}%`
      );
      continue;
    }

    // Single-source data is allowed to remain visible, but explicitly unverified.
    // The V6 peer-quality layer can still mark it SUSPECT and block persistence.
    const chosen = items[0];
    result.push({
      ...chosen.quote,
      sourceUrl: chosen.url,
      verificationState: "single-source",
      verificationSources: [chosen.url]
    });
    diagnostics.push(
      `DOJI ${product}: only ${items.length} usable fallback source(s); NOT cross-verified`
    );
  }

  return result;
}

async function fetchDojiFallback(
  p: Provider,
  diagnostics: string[]
): Promise<VietnamGoldQuote[]> {
  if (!p.fallbackUrls?.length) throw new Error("No DOJI fallback configured");

  const observations: FallbackObservation[] = [];

  for (const url of p.fallbackUrls) {
    try {
      const { text } = await fetchText(url);
      const rows = rowsFromHtml(text);

      // Critical V6.1 fix:
      // DOJI fallback NEVER uses the loose namedCandidatesFromText parser.
      // Only exact table rows are allowed.
      const candidates = exactDojiCandidatesFromRows(
        p,
        rows,
        url,
        "fallback"
      );
      const picked = pickBest(p, candidates);

      for (const quote of picked) {
        observations.push({ url, quote });
      }
      diagnostics.push(
        `DOJI strict fallback ${url}: ${picked.length}/2`
      );
    } catch (e) {
      diagnostics.push(
        `DOJI strict fallback ${url}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  const verified = verifyDojiFallback(observations, diagnostics);
  if (verified.length < 2) {
    throw new Error(
      `DOJI strict fallback found ${verified.length}/2 products`
    );
  }
  return verified;
}

async function fetchFallback(p: Provider, diagnostics: string[]): Promise<VietnamGoldQuote[]> {
  if (p.brand === "DOJI") return fetchDojiFallback(p, diagnostics);
  if (!p.fallbackUrls?.length) throw new Error("No fallback configured");
  const all: VietnamGoldQuote[] = [];
  for (const url of p.fallbackUrls) {
    try {
      const { text } = await fetchText(url);
      const candidates = [
        ...quoteCandidatesFromRows(p, rowsFromHtml(text), url, "fallback"),
        ...namedCandidatesFromText(p, pageText(text), url, "fallback")
      ];
      all.push(...candidates);
      diagnostics.push(`fallback ${url}: ${pickBest(p, candidates).length}/2`);
    } catch (e) {
      diagnostics.push(`fallback ${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const picked = pickBest(p, all);
  if (picked.length < 2) throw new Error(`${p.brand} fallback parser found ${picked.length}/2 products`);
  return picked;
}

async function runProvider(p: Provider): Promise<ProviderResult> {
  const attemptedAt = nowIso();
  const diagnostics: string[] = [];
  let officialError: unknown = null;
  try {
    let rows: VietnamGoldQuote[];
    if (p.brand === "SJC") rows = await fetchSjcOfficial(p, diagnostics);
    else if (p.brand === "PNJ") rows = await fetchPnjOfficial(p, diagnostics);
    else if (p.brand === "DOJI") rows = await fetchDojiOfficial(p, diagnostics);
    else rows = await fetchGenericOfficial(p, diagnostics);

    const successAt = nowIso();
    return {
      rows: rows.map(x => ({
        ...x,
        observedAt: successAt,
        sourceKind: "official",
        verificationState: "official",
        verificationSources: [p.officialUrl]
      })),
      status: {
        brand: p.brand, url: p.officialUrl, homeUrl: p.homeUrl,
        state: "live", available: true, sourceKind: "official", sourceLabel: "Official",
        lastAttemptAt: attemptedAt, lastSuccessAt: successAt, error: null, diagnostics
      }
    };
  } catch (e) { officialError = e; }

  if (p.fallbackUrls?.length) {
    try {
      const rows = await fetchFallback(p, diagnostics);
      const successAt = nowIso();
      return {
        rows: rows.map(x => ({ ...x, observedAt: successAt, sourceKind: "fallback" })),
        status: {
          brand: p.brand, url: p.officialUrl, homeUrl: p.homeUrl,
          state: "fallback", available: true, sourceKind: "fallback", sourceLabel: "Fallback",
          lastAttemptAt: attemptedAt, lastSuccessAt: successAt,
          error: `Official failed: ${officialError instanceof Error ? officialError.message : String(officialError)}`,
          diagnostics
        }
      };
    } catch (fallbackError) {
      return {
        rows: [],
        status: {
          brand: p.brand, url: p.officialUrl, homeUrl: p.homeUrl,
          state: "error", available: false, sourceKind: null, sourceLabel: null,
          lastAttemptAt: attemptedAt, lastSuccessAt: null,
          error: `Official: ${officialError instanceof Error ? officialError.message : String(officialError)}; fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          diagnostics
        }
      };
    }
  }

  return {
    rows: [],
    status: {
      brand: p.brand, url: p.officialUrl, homeUrl: p.homeUrl,
      state: "error", available: false, sourceKind: null, sourceLabel: null,
      lastAttemptAt: attemptedAt, lastSuccessAt: null,
      error: officialError instanceof Error ? officialError.message : String(officialError),
      diagnostics
    }
  };
}

export async function getVietnamGoldSnapshot(): Promise<{ rows: VietnamGoldQuote[]; statuses: VietnamProviderStatus[] }> {
  const results = await Promise.all(PROVIDERS.map(runProvider));
  const order = new Map(PROVIDERS.map((p, i) => [p.brand, i]));
  return {
    rows: results.flatMap(r => r.rows).sort((a, b) => (order.get(a.brand as Brand) ?? 99) - (order.get(b.brand as Brand) ?? 99)),
    statuses: results.map(r => r.status)
  };
}

export async function debugVietnamProvider(brand: string): Promise<ProviderResult | null> {
  const p = PROVIDERS.find(x => x.brand === brand.toUpperCase());
  if (!p) return null;
  return runProvider(p);
}

export const vietnamGoldProviders = PROVIDERS.map(p => ({ brand: p.brand, url: p.officialUrl, homeUrl: p.homeUrl }));
