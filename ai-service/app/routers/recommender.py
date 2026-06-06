from fastapi import APIRouter
from app.models.schemas import RecommendRequest, RecommendResponse, EmbedRequest, EmbedResponse
from app.ml import recommender_model

router = APIRouter()


@router.post("/recommend", response_model=RecommendResponse)
async def recommend(payload: RecommendRequest) -> RecommendResponse:
    """
    Personalised recommendation endpoint.
    Returns empty list until Sentence Transformer finishes loading (30–60s).
    NEVER hangs — the ready flag check is the guard.

    Backend caches results in Redis with 15min TTL per user.
    """
    if not recommender_model.recommender_ready:
        return RecommendResponse(recommendations=[])

    return recommender_model.predict(payload)


@router.post("/embed", response_model=EmbedResponse)
async def embed(payload: EmbedRequest) -> EmbedResponse:
    """
    Embed a new auction into the recommender's in-memory index.
    Called by the backend when a new auction is created (AUCTION_CREATED event).
    Requires: auction_id, description (title + full description concatenated).
    """
    if not recommender_model.recommender_ready:
        return EmbedResponse(auction_id=payload.auction_id, dimensions=0)

    # Parse title/category from description field (format: "category|title|description")
    parts = payload.description.split("|", 2)
    if len(parts) == 3:
        category, title, desc = parts
    else:
        category, title, desc = "other", "auction", payload.description

    recommender_model.embed_auction(
        auction_id=payload.auction_id,
        title=title,
        description=desc,
        category=category,
    )

    return EmbedResponse(auction_id=payload.auction_id, dimensions=384)
