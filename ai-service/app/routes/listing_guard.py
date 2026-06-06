# ai-service/app/routes/listing_guard.py
# Two pre-listing AI safety checks:
#   1. Counterfeit detector — Claude vision cross-checks stated brand/model vs photo
#   2. Duplicate detector — pgvector finds near-identical listings before they go live

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional
import base64, os, json, psycopg2, httpx
import numpy as np

router = APIRouter(prefix="/listing-guard", tags=["listing-guard"])
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL  = "claude-sonnet-4-20250514"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


# ── 1. Counterfeit detector ───────────────────────────────────────────────────

class CounterfeitResult(BaseModel):
    is_authentic: bool
    confidence: float           # 0–1
    risk_level: str             # low | medium | high | critical
    flags: list[str]            # specific issues found
    recommendation: str         # approve | review | reject
    reasoning: str


COUNTERFEIT_SYSTEM = """You are an expert authenticator for a premium auction house specialising in luxury watches,
cameras, art, jewelry, and electronics. You have 20 years of experience spotting fakes.

Given an item photo and its stated title/description, check for authenticity signals.
Respond ONLY with JSON (no markdown):
{
  "is_authentic": true/false,
  "confidence": 0.0-1.0,
  "risk_level": "low|medium|high|critical",
  "flags": ["flag1", "flag2"],
  "recommendation": "approve|review|reject",
  "reasoning": "2-sentence explanation"
}

Flag things like: incorrect font/logo, wrong proportions, missing hallmarks,
anachronistic details, suspiciously perfect condition, inconsistent aging."""


@router.post("/counterfeit-check", response_model=CounterfeitResult)
async def check_counterfeit(
    title: str = Form(...),
    description: str = Form(""),
    category: str = Form("other"),
    image: UploadFile = File(...),
):
    if image.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported image type: {image.content_type}")

    data = await image.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(400, "Image too large (max 8 MB)")

    if not ANTHROPIC_KEY:
        return CounterfeitResult(
            is_authentic=True, confidence=0.5, risk_level="low",
            flags=[], recommendation="approve",
            reasoning="Set ANTHROPIC_API_KEY for real counterfeit detection.",
        )

    b64 = base64.standard_b64encode(data).decode()
    prompt = f"Title: {title}\nDescription: {description}\nCategory: {category}\n\nIs this item authentic?"

    async with httpx.AsyncClient(timeout=25.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": CLAUDE_MODEL,
                "max_tokens": 400,
                "system": COUNTERFEIT_SYSTEM,
                "messages": [{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": image.content_type, "data": b64}},
                    {"type": "text", "text": prompt},
                ]}],
            },
        )

    if resp.status_code != 200:
        raise HTTPException(502, f"Claude API error: {resp.status_code}")

    try:
        raw = resp.json()["content"][0]["text"].strip()
        parsed = json.loads(raw)
        return CounterfeitResult(**parsed)
    except Exception:
        raise HTTPException(502, "Could not parse authentication response")


# ── 2. Duplicate listing detector ─────────────────────────────────────────────

class DuplicateCheckRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    category: str
    seller_id: str
    starting_price: float


class DuplicateResult(BaseModel):
    has_duplicates: bool
    duplicate_auction_ids: list[str]
    similarity_scores: list[float]
    recommendation: str


@router.post("/duplicate-check", response_model=DuplicateResult)
def check_duplicate(req: DuplicateCheckRequest):
    """
    Uses pgvector to find near-identical listings before they're published.
    Prevents sellers flooding categories and diluting their own demand.
    """
    # Try vector search first (if embeddings populated)
    conn = get_conn()
    try:
        cur = conn.cursor()

        # Check if embeddings exist
        cur.execute('SELECT COUNT(*) FROM "Auction" WHERE "searchEmbedding" IS NOT NULL LIMIT 1')
        has_embeddings = cur.fetchone()[0] > 0

        if has_embeddings:
            # Generate embedding for the new listing text
            try:
                from sentence_transformers import SentenceTransformer
                encoder = SentenceTransformer("all-MiniLM-L6-v2")
                text = f"{req.title} {req.description} {req.category}"
                emb = encoder.encode(text, normalize_embeddings=True)
                vec_str = "[" + ",".join(f"{v:.6f}" for v in emb.tolist()) + "]"

                cur.execute("""
                    SELECT id,
                           1 - ("searchEmbedding" <=> %s::vector) AS similarity
                    FROM "Auction"
                    WHERE "sellerId" = %s
                      AND status IN ('ACTIVE', 'SCHEDULED')
                      AND "searchEmbedding" IS NOT NULL
                    ORDER BY "searchEmbedding" <=> %s::vector
                    LIMIT 5
                """, [vec_str, req.seller_id, vec_str])

                rows = cur.fetchall()
                duplicates = [(r[0], float(r[1])) for r in rows if float(r[1]) > 0.85]

                if duplicates:
                    return DuplicateResult(
                        has_duplicates=True,
                        duplicate_auction_ids=[d[0] for d in duplicates],
                        similarity_scores=[round(d[1], 3) for d in duplicates],
                        recommendation="You have a very similar active listing. Consider updating it instead of creating a new one.",
                    )
            except ImportError:
                pass  # fall through to text-based check

        # Fallback: PostgreSQL full-text similarity
        cur.execute("""
            SELECT id,
                   similarity(title, %s) AS sim
            FROM "Auction"
            WHERE "sellerId" = %s
              AND status IN ('ACTIVE', 'SCHEDULED')
              AND similarity(title, %s) > 0.6
            ORDER BY sim DESC
            LIMIT 3
        """, [req.title, req.seller_id, req.title])

        rows = cur.fetchall()
        if rows:
            return DuplicateResult(
                has_duplicates=True,
                duplicate_auction_ids=[r[0] for r in rows],
                similarity_scores=[round(float(r[1]), 3) for r in rows],
                recommendation="Similar listing already active. Consider updating your existing listing.",
            )

        return DuplicateResult(
            has_duplicates=False,
            duplicate_auction_ids=[],
            similarity_scores=[],
            recommendation="No duplicates found — safe to publish.",
        )
    finally:
        conn.close()
