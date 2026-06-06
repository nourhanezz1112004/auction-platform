"""
Async PostgreSQL connection pool for the AI service.
Used by seller_insights and momentum endpoints to query real auction data.

Pattern: get_db() yields a connection from the pool.
Pool is created lazily on first use and shared across requests.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

_pool = None


async def _get_pool():
    global _pool
    if _pool is None:
        try:
            import asyncpg
            _pool = await asyncpg.create_pool(
                dsn=os.getenv(
                    "DATABASE_URL",
                    "postgresql://user:pass@localhost:5432/auction_db",
                ),
                min_size=1,
                max_size=5,
                command_timeout=10,
            )
            logger.info("AI service DB pool created.")
        except Exception as e:
            logger.warning(f"DB pool creation failed: {e} — AI endpoints will use fallback data.")
            _pool = None
    return _pool


@asynccontextmanager
async def get_db() -> AsyncGenerator:
    """Yields a DB connection or None if DB is unavailable."""
    pool = await _get_pool()
    if pool is None:
        yield None
        return
    async with pool.acquire() as conn:
        yield conn


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
