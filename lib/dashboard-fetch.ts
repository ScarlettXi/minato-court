// Read-only recovery. Never replay settings, reservations, login, or payments.
export async function fetchDashboard(transport: typeof fetch = fetch, wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await transport("/api/dashboard", {cache:"no-store", signal:AbortSignal.timeout(15_000)});
      if (response.status !== 502 && response.status !== 503 && response.status !== 504) return response;
      if (attempt === 2) return response;
    } catch {
      if (attempt === 2) throw new Error("暂时无法读取监控数据");
    }
    await wait(1000 * 2 ** attempt);
  }
  throw new Error("暂时无法读取监控数据");
}
