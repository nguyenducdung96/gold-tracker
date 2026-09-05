import type { VietnamGoldQuote, WorldGoldQuote } from "./types.js";
import type { VietnamProviderStatus } from "./providers/vietnamGold.js";

export async function getState(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM app_state WHERE key=?").bind(key).first<{value:string}>();
  return row?.value ?? null;
}

export async function setState(db: D1Database, key: string, value: string) {
  const now = Date.now();
  await db.prepare(`
    INSERT INTO app_state(key,value,updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `).bind(key, value, now).run();
}

export async function saveWorldIfDue(db: D1Database, q: WorldGoldQuote, minIntervalMs = 60_000) {
  const last = Number(await getState(db, "world_last_persist_ts") ?? 0);
  const now = Date.now();
  if (now - last < minIntervalMs) return false;
  const ts = Date.parse(q.receivedAt ?? q.observedAt);
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO world_gold_history(ts,price,source) VALUES(?,?,?)")
      .bind(ts, q.price, q.source),
    db.prepare(`
      INSERT INTO app_state(key,value,updated_at) VALUES('world_last_persist_ts',?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    `).bind(String(now), now),
    db.prepare(`
      INSERT INTO app_state(key,value,updated_at) VALUES('world_latest',?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    `).bind(JSON.stringify(q), now)
  ]);
  return true;
}

export async function getPreviousWorldClose(db: D1Database): Promise<number | null> {
  const now = new Date();
  const startToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const row = await db.prepare(`
    SELECT price FROM world_gold_history WHERE ts < ? ORDER BY ts DESC LIMIT 1
  `).bind(startToday).first<{price:number}>();
  return row?.price ?? null;
}

export async function getWorldHistory(db: D1Database, hours = 24) {
  const since = Date.now() - hours * 3600_000;
  const result = await db.prepare(`
    SELECT ts,price,source FROM world_gold_history
    WHERE ts>=? ORDER BY ts ASC
  `).bind(since).all();
  return result.results ?? [];
}

export async function saveVietnamSnapshot(
  db: D1Database,
  rows: VietnamGoldQuote[],
  statuses: VietnamProviderStatus[]
) {
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  for (const q of rows) {
    statements.push(
      db.prepare(`
        INSERT INTO vn_gold_latest(
          brand,product,product_name,buy,sell,source_url,source_kind,
          verification_state,verification_sources,quality_state,quality_reason,
          deviation_pct,consensus_price,observed_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(brand,product) DO UPDATE SET
          product_name=excluded.product_name,buy=excluded.buy,sell=excluded.sell,
          source_url=excluded.source_url,source_kind=excluded.source_kind,
          verification_state=excluded.verification_state,
          verification_sources=excluded.verification_sources,
          quality_state=excluded.quality_state,quality_reason=excluded.quality_reason,
          deviation_pct=excluded.deviation_pct,consensus_price=excluded.consensus_price,
          observed_at=excluded.observed_at,updated_at=excluded.updated_at
      `).bind(
        q.brand, q.product, q.productName, q.buy, q.sell, q.sourceUrl,
        q.sourceKind ?? null, q.verificationState ?? null,
        JSON.stringify(q.verificationSources ?? []),
        q.qualityState ?? "ok", JSON.stringify(q.qualityReasons ?? []),
        q.peerDeviationPct ?? null, q.peerMedianSell ?? null,
        q.observedAt, now
      )
    );

    if (q.qualityState !== "suspect") {
      statements.push(
        db.prepare(`
          INSERT INTO vn_gold_history(
            ts,brand,product,product_name,buy,sell,source_url,source_kind,verification_state
          ) VALUES(?,?,?,?,?,?,?,?,?)
        `).bind(
          Date.parse(q.observedAt), q.brand, q.product, q.productName,
          q.buy, q.sell, q.sourceUrl, q.sourceKind ?? null,
          q.verificationState ?? null
        )
      );
    }
  }

  for (const status of statuses) {
    statements.push(
      db.prepare(`
        INSERT INTO provider_status(brand,payload,updated_at) VALUES(?,?,?)
        ON CONFLICT(brand) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at
      `).bind(status.brand, JSON.stringify(status), now)
    );
  }

  if (statements.length) await db.batch(statements);
}

export async function getLatestVietnam(db: D1Database): Promise<VietnamGoldQuote[]> {
  const result = await db.prepare(`
    SELECT * FROM vn_gold_latest
    ORDER BY CASE brand
      WHEN 'SJC' THEN 1 WHEN 'PNJ' THEN 2 WHEN 'DOJI' THEN 3
      WHEN 'BTMC' THEN 4 WHEN 'PHUQUY' THEN 5 ELSE 99 END,
      CASE product WHEN 'bar' THEN 1 ELSE 2 END
  `).all<any>();

  return (result.results ?? []).map((r:any) => ({
    brand: r.brand,
    product: r.product,
    productName: r.product_name,
    buy: r.buy,
    sell: r.sell,
    currency: "VND",
    unit: "luong",
    sourceUrl: r.source_url,
    sourceKind: r.source_kind,
    verificationState: r.verification_state,
    verificationSources: JSON.parse(r.verification_sources ?? "[]"),
    qualityState: r.quality_state ?? "ok",
    qualityReasons: JSON.parse(r.quality_reason ?? "[]"),
    peerDeviationPct: r.deviation_pct,
    peerMedianSell: r.consensus_price,
    observedAt: r.observed_at
  })) as VietnamGoldQuote[];
}

export async function getProviderStatuses(db: D1Database): Promise<VietnamProviderStatus[]> {
  const result = await db.prepare("SELECT payload FROM provider_status").all<{payload:string}>();
  return (result.results ?? []).flatMap(r => {
    try { return [JSON.parse(r.payload) as VietnamProviderStatus]; }
    catch { return []; }
  });
}

export async function getVNHistory(db: D1Database, brand: string, product: string, hours: number) {
  const since = Date.now() - hours * 3600_000;
  const result = await db.prepare(`
    SELECT ts,buy,sell,product_name AS productName
    FROM vn_gold_history
    WHERE brand=? AND product=? AND ts>=?
    ORDER BY ts ASC
  `).bind(brand, product, since).all();
  return result.results ?? [];
}

export async function setFx(db: D1Database, value: number) {
  await db.prepare(`
    INSERT INTO fx_latest(pair,value,observed_at) VALUES('USDVND',?,?)
    ON CONFLICT(pair) DO UPDATE SET value=excluded.value, observed_at=excluded.observed_at
  `).bind(value, Date.now()).run();
}

export async function getFx(db: D1Database): Promise<number | null> {
  const row = await db.prepare("SELECT value FROM fx_latest WHERE pair='USDVND'")
    .first<{value:number}>();
  return row?.value ?? null;
}

export async function logCron(db: D1Database, job: string, ok: boolean, error?: string) {
  const now = Date.now();
  await db.prepare(`
    INSERT INTO cron_log(job,last_run_at,last_ok_at,last_error) VALUES(?,?,?,?)
    ON CONFLICT(job) DO UPDATE SET
      last_run_at=excluded.last_run_at,
      last_ok_at=CASE WHEN ? THEN excluded.last_run_at ELSE cron_log.last_ok_at END,
      last_error=excluded.last_error
  `).bind(job, now, ok ? now : null, error ?? null, ok ? 1 : 0).run();
}

export async function cleanup(db: D1Database) {
  const worldBefore = Date.now() - 30 * 86400_000;
  const vnBefore = Date.now() - 365 * 86400_000;
  await db.batch([
    db.prepare("DELETE FROM world_gold_history WHERE ts < ?").bind(worldBefore),
    db.prepare("DELETE FROM vn_gold_history WHERE ts < ?").bind(vnBefore)
  ]);
}
