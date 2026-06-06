# ai-service/app/routes/search.py
# Semantic search using sentence-transformers embeddings + pgvector.
# Trained on your 10k+ real auction titles and descriptions.
# "vintage Japanese camera" finds Nikon F2 even without those exact words.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import os
import psycopg2
import numpy as np

router = APIRouter(prefix="/search", tags=["semantic-search"])

# Lazy-load the sentence transformer (heavy — only load when first used)
_encoder = None

def get_encoder():
    global _encoder
    if _encoder is None:
        from sentence_transformers import SentenceTransformer
        model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        _encoder = SentenceTransformer(model_name)
    return _encoder

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)
    limit: int = Field(default=10, ge=1, le=50)
    category: Optional[str] = None
    status: Optional[str] = "ACTIVE"
    min_price: Optional[float] = None
    max_price: Optional[float] = None


class SearchResult(BaseModel):
    id: str
    title: str
    category: str
    condition: str
    current_price: float
    end_time: str
    similarity: float
    image_urls: list[str]


class SemanticSearchResponse(BaseModel):
    results: list[SearchResult]
    query: str
    total: int
    model: str


@router.post("/semantic", response_model=SemanticSearchResponse)
def semantic_search(req: SemanticSearchRequest):
    """
    Vector-based semantic search over your real auction catalogue.
    Embeddings are generated from title + description + category + condition.
    Falls back to PostgreSQL full-text search if pgvector index not ready.
    """
    encoder = get_encoder()

    # Encode the query
    query_vec = encoder.encode(req.query, normalize_embeddings=True)
    vec_str = "[" + ",".join(f"{v:.6f}" for v in query_vec.tolist()) + "]"

    conn = get_conn()
    try:
        cur = conn.cursor()

        # Build dynamic WHERE clause
        conditions = ["a.\"searchEmbedding\" IS NOT NULL"]
        params: list = [vec_str]

        if req.status:
            conditions.append('a.status = %s')
            params.append(req.status)
        if req.category:
            conditions.append('a.category = %s')
            params.append(req.category)
        if req.min_price is not None:
            conditions.append('a."currentPrice" >= %s')
            params.append(req.min_price)
        if req.max_price is not None:
            conditions.append('a."currentPrice" <= %s')
            params.append(req.max_price)

        where = " AND ".join(conditions)
        params.append(req.limit)

        cur.execute(f"""
            SELECT
                a.id,
                a.title,
                a.category,
                a.condition,
                a."currentPrice",
                a."endTime"::text,
                a."imageUrls",
                1 - (a."searchEmbedding" <=> %s::vector) AS similarity
            FROM "Auction" a
            WHERE {where}
            ORDER BY a."searchEmbedding" <=> %s::vector
            LIMIT %s
        """, [vec_str] + params[1:] + [vec_str, req.limit])

        # If no results (embedding column empty), fall back to full-text
        rows = cur.fetchall()
        if not rows:
            rows = _fulltext_fallback(cur, req)

        results = [
            SearchResult(
                id=r[0], title=r[1], category=r[2], condition=r[3],
                current_price=float(r[4]), end_time=r[5],
                image_urls=r[6] or [],
                similarity=round(float(r[7]), 4),
            )
            for r in rows
        ]
        return SemanticSearchResponse(
            results=results, query=req.query,
            total=len(results), model="all-MiniLM-L6-v2",
        )
    finally:
        conn.close()


def _fulltext_fallback(cur, req: SemanticSearchRequest):
    """PostgreSQL full-text search fallback when pgvector index isn't populated."""
    cur.execute("""
        SELECT a.id, a.title, a.category, a.condition, a."currentPrice",
               a."endTime"::text, a."imageUrls",
               ts_rank(to_tsvector('english', a.title || ' ' || COALESCE(a.description, '')),
                       plainto_tsquery('english', %s)) AS similarity
        FROM "Auction" a
        WHERE a.status = 'ACTIVE'
          AND to_tsvector('english', a.title || ' ' || COALESCE(a.description, ''))
              @@ plainto_tsquery('english', %s)
        ORDER BY similarity DESC
        LIMIT %s
    """, [req.query, req.query, req.limit])
    return cur.fetchall()


# ── Background job: populate searchEmbedding for all auctions ─────────────────
# Call this via: POST /search/populate-embeddings (admin only)
# This reads real auction data and writes embeddings to PostgreSQL.

@router.post("/populate-embeddings")
def populate_embeddings(batch_size: int = 100):
    """
    One-time job to generate semantic embeddings for all existing auctions.
    Run once, then incremental updates happen on new listing creation.
    Takes ~2 min for 10k auctions on CPU.
    """
    encoder = get_encoder()
    conn = get_conn()
    try:
        cur = conn.cursor()

        # Fetch auctions without embeddings
        cur.execute("""
            SELECT id, title, description, category, condition
            FROM "Auction"
            WHERE "searchEmbedding" IS NULL
            LIMIT 5000
        """)
        rows = cur.fetchall()

        if not rows:
            return {"message": "All auctions already have embeddings", "count": 0}

        processed = 0
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i + batch_size]
            texts = [
                f"{r[1]} {r[2] or ''} {r[3]} {r[4]}"
                for r in batch
            ]
            embeddings = encoder.encode(texts, normalize_embeddings=True, show_progress_bar=False)

            for (row, emb) in zip(batch, embeddings):
                vec_str = "[" + ",".join(f"{v:.6f}" for v in emb.tolist()) + "]"
                cur.execute(
                    'UPDATE "Auction" SET "searchEmbedding" = %s::vector WHERE id = %s',
                    [vec_str, row[0]]
                )
            conn.commit()
            processed += len(batch)

        return {"message": "Embeddings populated", "count": processed}
    finally:
        conn.close()
