export const CLOUD_API_URL = "https://expressgo.onrender.com";

let apiUrl = "";

export function normalizeApiUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

export function getApiUrl(): string {
  return apiUrl;
}

export function setApiUrl(value: string) {
  apiUrl = normalizeApiUrl(value);
}

export function isRemoteApi(): boolean {
  return apiUrl.length > 0;
}

export async function pingApi(url?: string): Promise<boolean> {
  const base = normalizeApiUrl(url ?? apiUrl);
  if (!base) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`${base}/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
