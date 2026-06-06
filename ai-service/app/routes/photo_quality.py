# ai-service/app/routes/photo_quality.py
# Scores auction item photos for quality before listing goes live.
# Uses Claude vision — better photos = higher final prices (proven correlation).

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
import base64, os, httpx

router = APIRouter(prefix="/photo", tags=["photo-quality"])
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MAX_BYTES = 8 * 1024 * 1024
ALLOWED = {"image/jpeg", "image/png", "image/webp"}


class PhotoQualityResponse(BaseModel):
    overall_score: float        # 0–10
    lighting_score: float
    clarity_score: float
    background_score: float
    angle_score: float
    issues: list[str]           # specific problems found
    suggestions: list[str]      # actionable improvements
    approved: bool              # True if score >= 6.5
    estimated_price_impact: str # "high" | "medium" | "low"


QUALITY_SYSTEM = """You are an expert auction photography assessor for a premium auction house specialising in watches, cameras, art, and jewelry.
Evaluate the photo and respond ONLY with a JSON object — no markdown, no preamble:
{
  "overall_score": 0-10,
  "lighting_score": 0-10,
  "clarity_score": 0-10,
  "background_score": 0-10,
  "angle_score": 0-10,
  "issues": ["issue1", "issue2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "approved": true/false,
  "estimated_price_impact": "high/medium/low"
}
Score 7+ = approved. Be strict — blurry, poorly lit, or cluttered background photos reduce final sale price by 15-30%."""


@router.post("/quality-score", response_model=PhotoQualityResponse)
async def score_photo(image: UploadFile = File(...)):
    if image.content_type not in ALLOWED:
        raise HTTPException(400, f"Unsupported type: {image.content_type}")
    data = await image.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(400, "Image too large (max 8 MB)")

    if not ANTHROPIC_KEY:
        # Fallback: return a passing score for development
        return PhotoQualityResponse(
            overall_score=7.0, lighting_score=7.0, clarity_score=7.0,
            background_score=7.0, angle_score=7.0,
            issues=[], suggestions=["Add ANTHROPIC_API_KEY for real photo scoring"],
            approved=True, estimated_price_impact="medium",
        )

    b64 = base64.standard_b64encode(data).decode()
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={
                "model": "claude-sonnet-4-20250514", "max_tokens": 400,
                "system": QUALITY_SYSTEM,
                "messages": [{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": image.content_type, "data": b64}},
                    {"type": "text", "text": "Score this auction item photo."},
                ]}],
            },
        )

    if resp.status_code != 200:
        raise HTTPException(502, "Claude API error")

    import json
    try:
        parsed = json.loads(resp.json()["content"][0]["text"].strip())
        return PhotoQualityResponse(**parsed)
    except Exception:
        raise HTTPException(502, "Could not parse quality response")
