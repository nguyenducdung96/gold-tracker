let cache: { value: number; ts: number } | null = null;

export async function getUsdVnd(): Promise<number | null> {
  if (cache && Date.now() - cache.ts < 30 * 60_000) return cache.value;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "gold-tracker-pwa/2.0" }
    });
    if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
    const json = await res.json() as any;
    const value = Number(json?.rates?.VND);
    if (!Number.isFinite(value) || value < 10000) return null;
    cache = { value, ts: Date.now() };
    return value;
  } catch (err) {
    console.error("USD/VND provider failed:", err);
    return cache?.value ?? null;
  }
}
