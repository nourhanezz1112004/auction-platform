# ai-service/app/routes/describe.py
# POST /describe/item — accepts an image, returns structured auction listing data.
# Uses Claude claude-sonnet-4-20250514 vision. Falls back gracefully if API key is missing.

import base64, os
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx

router = APIRouter(prefix="/describe", tags=["description"])

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-20250514"
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


class ItemDescription(BaseModel):
    title: str
    category: str               # watches | cameras | art | jewelry | electronics | other
    condition: str              # poor | fair | good | very good | excellent | mint
    estimated_era: Optional[str]
    key_features: list[str]
    suggested_description: str
    confidence: str             # high | medium | low


SYSTEM_PROMPT = """You are an expert auction house appraiser specialising in rare collectibles,
fine watches, vintage cameras, art, and jewelry. When shown an item photo you return a JSON
object ONLY — no preamble, no markdown fences, just raw JSON — with this exact structure:
{
  "title": "concise item title (max 80 chars)",
  "category": "one of: watches | cameras | art | jewelry | electronics | other",
  "condition": "one of: poor | fair | good | very good | excellent | mint",
  "estimated_era": "decade/period or null if unclear",
  "key_features": ["feature 1", "feature 2", "feature 3"],
  "suggested_description": "2–3 sentence compelling auction description",
  "confidence": "high | medium | low"
}"""


@router.post("/item", response_model=ItemDescription)
async def describe_item(image: UploadFile = File(...)):
    # Validate
    if image.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported image type: {image.content_type}")

    data = await image.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(400, "Image too large (max 5 MB)")

    if not ANTHROPIC_API_KEY:
        # Demo fallback when key not configured
        return ItemDescription(
            title="Vintage collectible item",
            category="other",
            condition="good",
            estimated_era="1970s–1990s",
            key_features=["Vintage design", "Collectible condition", "Well preserved"],
            suggested_description="A quality vintage collectible in good condition. "
                                   "Ideal for collectors of period pieces.",
            confidence="low",
        )

    b64 = base64.standard_b64encode(data).decode()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": CLAUDE_MODEL,
                "max_tokens": 600,
                "system": SYSTEM_PROMPT,
                "messages": [{
                    "role": "user",
                    "content": [{
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": image.content_type,
                            "data": b64,
                        },
                    }, {
                        "type": "text",
                        "text": "Describe this auction item.",
                    }],
                }],
            },
        )

    if resp.status_code != 200:
        raise HTTPException(502, f"Claude API error: {resp.text[:200]}")

    import json
    raw = resp.json()["content"][0]["text"].strip()
    try:
        parsed = json.loads(raw)
        return ItemDescription(**parsed)
    except Exception:
        raise HTTPException(502, f"Could not parse Claude response: {raw[:200]}")
