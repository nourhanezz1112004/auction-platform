import { logger } from './logger';

/**
 * Wraps any AI service call with:
 *  - a hard timeout (default 400ms — AI must never slow down bidding)
 *  - a typed fallback returned on timeout OR any error
 *  - structured warning log with label + error for observability
 *
 * Usage:
 *   const result = await callWithFallback(
 *     () => fetch('/ai/fraud', { ... }).then(r => r.json()),
 *     AI_FALLBACKS.fraud,
 *     'fraud',
 *   );
 *
 * RULE: Every call to the AI service must go through this function.
 * Fallback values must always ALLOW the action to proceed (never block on AI failure).
 */
export async function callWithFallback<T>(
  aiCall:    () => Promise<T>,
  fallback:  T,
  label:     string,
  timeoutMs: number = 400,
): Promise<T> {
  try {
    return await Promise.race([
      aiCall(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        )
      ),
    ]);
  } catch (err) {
    logger.warn(
      { label, err: String(err), fallback },
      `AI service unavailable — using fallback for ${label}`,
    );
    return fallback;
  }
}
