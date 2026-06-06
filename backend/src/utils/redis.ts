import Redis from 'ioredis';
import { logger } from '@auction/shared-utils';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('connect',   () => logger.info('Redis connected'));
redis.on('error',     (err) => logger.error({ err }, 'Redis error'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));
