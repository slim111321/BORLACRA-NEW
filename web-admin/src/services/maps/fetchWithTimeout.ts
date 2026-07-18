/**
 * fetch with a hard timeout. Without this, a slow/unresponsive endpoint
 * leaves the request pending forever — nothing ever resolves or rejects, so
 * a caller relying on a try/catch fallback chain never gets a chance to
 * move on. Mirrors utils/fetchWithTimeout.ts in the mobile app (root repo) —
 * duplicated here rather than imported since web-admin is a separate Vite
 * project with its own dependency tree.
 */
export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
