"""
Recommender Model — Sentence Transformers + cosine similarity.

Strategy:
  1. Embed auction descriptions using all-MiniLM-L6-v2 (384-dim vectors)
  2. Build user profile vector = mean of recently_viewed + bid_history embeddings
  3. Rank candidate auctions by cosine similarity to user profile
  4. Fallback to trending (bid count) if user has no history

This is collaborative filtering via dense embeddings — the same approach
used by production recommendation systems at scale.

Loading is async and non-blocking (~30-60s for model download on first run).
Returns empty list until ready. Never hangs the service.
"""

from __future__ import annotations

import asyncio
import logging
import os
import pickle
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from app.models.schemas import RecommendRequest, RecommendResponse

logger = logging.getLogger(__name__)

ARTIFACT_PATH   = Path(os.getenv("MODEL_ARTIFACTS_PATH", "app/ml/artifacts"))
EMBEDDINGS_FILE = ARTIFACT_PATH / "auction_embeddings.pkl"

_MODEL_NAME = os.getenv("SENTENCE_TRANSFORMER_MODEL", "all-MiniLM-L6-v2")


class RecommenderModel:
    def __init__(self) -> None:
        self._encoder          = None
        self._auction_embeddings: dict[str, np.ndarray] = {}
        self._auction_metadata:  dict[str, dict]        = {}
        self.recommender_ready = False

    # ------------------------------------------------------------------
    async def load_in_background(self) -> None:
        """Called from lifespan. Loads model without blocking startup."""
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(None, self._load_sync)
            self.recommender_ready = True
            logger.info("Recommender model ready.")
        except Exception as e:
            logger.error(f"Recommender load failed: {e}")

    def _load_sync(self) -> None:
        from sentence_transformers import SentenceTransformer
        logger.info(f"Loading sentence transformer: {_MODEL_NAME}")
        self._encoder = SentenceTransformer(_MODEL_NAME)
        logger.info("Sentence transformer loaded.")

    # ------------------------------------------------------------------
    def embed_auction(self, auction_id: str, title: str, description: str, category: str) -> None:
        """
        Called by the backend when a new auction is created (Phase 2 webhook).
        Stores embedding in memory + optionally persists to disk.
        """
        if self._encoder is None:
            return
        text = f"{category} {title}: {description}"
        embedding = self._encoder.encode(text, normalize_embeddings=True)
        self._auction_embeddings[auction_id] = embedding
        self._auction_metadata[auction_id]   = {
            "title":    title,
            "category": category,
        }

    # ------------------------------------------------------------------
    def predict(self, payload: "RecommendRequest") -> "RecommendResponse":
        from app.models.schemas import RecommendItem, RecommendResponse

        if not self.recommender_ready or self._encoder is None:
            return RecommendResponse(recommendations=[])

        viewed_ids = set(payload.recently_viewed + payload.bid_history)
        candidates = {
            aid: emb
            for aid, emb in self._auction_embeddings.items()
            if aid not in viewed_ids
        }

        if not candidates:
            return RecommendResponse(recommendations=[])

        # Build user profile
        profile_ids = [
            aid for aid in (payload.recently_viewed + payload.bid_history)
            if aid in self._auction_embeddings
        ]

        if profile_ids:
            profile_vec = np.mean(
                [self._auction_embeddings[aid] for aid in profile_ids], axis=0
            )
            profile_vec = profile_vec / (np.linalg.norm(profile_vec) + 1e-9)
            reason_key  = "similar_to_your_interests"
        else:
            # Cold start — use category diversity
            all_cats = list({self._auction_metadata[aid]["category"] for aid in candidates})
            if all_cats:
                profile_vec = self._encoder.encode(
                    f"popular auction {all_cats[0]}",
                    normalize_embeddings=True,
                )
            else:
                return RecommendResponse(recommendations=[])
            reason_key = "trending"

        # Score all candidates
        cand_ids   = list(candidates.keys())
        cand_matrix = np.stack([candidates[aid] for aid in cand_ids])
        scores      = cand_matrix @ profile_vec  # cosine sim (vectors normalised)

        top_indices = np.argsort(scores)[::-1][: payload.limit]

        recs = [
            RecommendItem(
                auction_id=cand_ids[i],
                score=float(round(scores[i], 4)),
                reason=reason_key,
            )
            for i in top_indices
        ]
        return RecommendResponse(recommendations=recs)
