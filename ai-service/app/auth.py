"""
Internal API key authentication for the AI service.

CORS only protects against browser requests.  Any non-browser client
(curl, another service, an attacker on the internal network) can call
the AI endpoints without CORS restrictions.  This module adds a
shared-secret check so only the backend (which sends X-Internal-Key)
can reach the AI endpoints.

Configuration
-------------
Set AI_INTERNAL_KEY in the environment (same value in backend's env as
AI_INTERNAL_KEY).  If not set, the check is skipped in development to
avoid breaking local dev without extra configuration.
"""

import os
from fastapi import Header, HTTPException, status


_INTERNAL_KEY = os.getenv("AI_INTERNAL_KEY", "")


async def require_internal_key(
    x_internal_key: str = Header(default="", alias="x-internal-key"),
) -> None:
    """
    FastAPI dependency that validates the X-Internal-Key header.

    - If AI_INTERNAL_KEY is not set (empty string), the check is skipped
      so local development works without extra configuration.
    - In any environment where AI_INTERNAL_KEY IS set, the header must
      match exactly or the request is rejected with HTTP 403.
    """
    if not _INTERNAL_KEY:
        # Dev mode — key not configured, allow all internal traffic
        return

    if x_internal_key != _INTERNAL_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing internal API key",
        )
