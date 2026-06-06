// backend/src/lib/redis.ts
// Singleton Redis client shared across the app

import { createClient } from 'redis';

export const redisClient = createClient({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
});

redisClient.on('error', (err) => console.error('[redis] Client error', err));
redisClient.on('connect', () => console.log('[redis] Connected'));

if (process.env.NODE_ENV !== 'test') {
  redisClient.connect().catch(console.error);
}

export default redisClient;
