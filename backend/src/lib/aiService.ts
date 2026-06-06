// backend/src/lib/aiService.ts
// Helper to call AI service with fallback

const AI_SERVICE = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';

export async function callWithFallback<T>(
  path: string,
  body: unknown,
  timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 5000),
): Promise<T | null> {
  try {
    const res = await fetch(`${AI_SERVICE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}
