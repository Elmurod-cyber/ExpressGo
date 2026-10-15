export function assertOnline(url: string, message: string) {
  if (!url.trim()) throw new Error(message);
}

export async function postRpc<T>(
  base: string,
  method: string,
  args: unknown[],
  token: string,
  unreachable: string,
): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    response = await fetch(`${base}/rpc`, {
      method: "POST",
      headers,
      body: JSON.stringify({ method, args }),
      signal: controller.signal,
    });
  } catch {
    throw new Error(unreachable);
  } finally {
    clearTimeout(timer);
  }
  const data = (await response.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!response.ok) {
    throw new Error(data.error || unreachable);
  }
  if (data.result === undefined) {
    throw new Error(unreachable);
  }
  return data.result;
}
