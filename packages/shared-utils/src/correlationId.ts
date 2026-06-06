import { v4 as uuidv4 } from 'uuid';

export const X_CORRELATION_ID = 'x-correlation-id';

/**
 * Generates a new correlation ID or extracts one from an incoming request header.
 * Attach to every log line and every outbound AI service call so you can trace
 * a single bid across backend → ai-service in logs.
 */
export function getCorrelationId(headers?: Record<string, string | string[] | undefined>): string {
  const incoming = headers?.[X_CORRELATION_ID];
  if (typeof incoming === 'string' && incoming.length > 0) return incoming;
  return uuidv4();
}
