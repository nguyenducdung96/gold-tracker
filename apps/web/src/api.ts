import type { Dashboard, WorldHistoryResponse, WorldRange } from "./types";
const BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? "";

export async function getDashboard(): Promise<Dashboard> {
  const r = await fetch(`${BASE}/api/gold/dashboard`);
  if (!r.ok) throw new Error(`Dashboard HTTP ${r.status}`);
  return r.json();
}

export async function getWorldHistory(range: WorldRange = "1D"): Promise<WorldHistoryResponse> {
  const r = await fetch(`${BASE}/api/gold/world/history?range=${range}`);
  if (!r.ok) throw new Error(`History HTTP ${r.status}`);
  return r.json();
}

export async function getVNHistory(brand: string, product: string, hours = 168) {
  const qs = new URLSearchParams({ brand, product, hours: String(hours) });
  const r = await fetch(`${BASE}/api/gold/vietnam/history?${qs}`);
  if (!r.ok) throw new Error(`VN history HTTP ${r.status}`);
  return r.json();
}

export function subscribeDashboard(onData: (data: Dashboard) => void) {
  const intervalMs = Math.max(
    5000,
    Number((import.meta as any).env?.VITE_DASHBOARD_POLL_MS ?? 10000)
  );

  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running || document.hidden) return;
    running = true;
    try {
      onData(await getDashboard());
    } catch (error) {
      console.error("Dashboard poll failed", error);
    } finally {
      running = false;
    }
  };

  const id = window.setInterval(tick, intervalMs);
  const onVisible = () => {
    if (!document.hidden) tick();
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    stopped = true;
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
