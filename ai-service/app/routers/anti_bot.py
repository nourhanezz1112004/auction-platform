from fastapi import APIRouter
from app.models.schemas import AntiBotRequest, AntiBotResponse
from app.ml import anti_bot_model

router = APIRouter()


@router.post("/anti-bot", response_model=AntiBotResponse)
async def anti_bot(payload: AntiBotRequest) -> AntiBotResponse:
    """
    Bot detection endpoint.
    Called by backend bids.service.ts before accepting any bid.

    Confidence tiers (from AI_THRESHOLDS in shared-types):
      > 0.7  → backend returns 403 bot_detected
      > 0.4  → backend triggers CAPTCHA challenge
      ≤ 0.4  → clean, bid proceeds
    """
    return anti_bot_model.predict(payload)
