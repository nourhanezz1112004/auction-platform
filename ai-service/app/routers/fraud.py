from fastapi import APIRouter
from app.models.schemas import FraudRequest, FraudResponse
from app.ml import fraud_model

router = APIRouter()


@router.post("/fraud", response_model=FraudResponse)
async def fraud(payload: FraudRequest) -> FraudResponse:
    """
    Fraud detection endpoint.
    Called by backend bids.service.ts after anti-bot passes.

    Score tiers (from AI_THRESHOLDS in shared-types):
      > 0.7  → backend returns 402 fraud_flagged + writes FraudFlag record
      > 0.4  → backend writes FraudFlag record (log only, bid allowed)
      ≤ 0.4  → clean
    """
    return fraud_model.predict(payload)
