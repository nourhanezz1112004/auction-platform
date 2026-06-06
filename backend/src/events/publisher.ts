import { redis } from '../utils/redis';
import { EventTopic } from '@auction/shared-events';

/**
 * Typed publish wrapper.
 * Usage: await publish(EVENTS.BID_PLACED, payload);
 */
export async function publish(topic: EventTopic, payload: unknown): Promise<void> {
  await redis.publish(topic, JSON.stringify(payload));
}
