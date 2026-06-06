# ai-service/app/routes/dispute.py
# AI dispute resolution — reads the full audit log, bid history, and payment
# records for a transaction and generates a case summary + recommended resolution.
# Saves admin hours on every dispute ticket.

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import os, psycopg2, httpx, json

router = APIRouter(prefix="/dispute", tags=["dispute"])
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL  = "claude-sonnet-4-20250514"

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


class DisputeAnalysisRequest(BaseModel):
    auction_id: str
    dispute_reason: str = Field(..., min_length=10)
    filed_by: str          # "buyer" | "seller"
    claimant_id: str


class DisputeAnalysisResponse(BaseModel):
    case_summary: str
    timeline: list[dict]        # chronological events from audit log
    key_facts: list[str]
    recommended_resolution: str  # "refund_buyer" | "release_to_seller" | "partial_refund" | "escalate"
    confidence: str              # high | medium | low
    reasoning: str
    evidence_for_buyer: list[str]
    evidence_for_seller: list[str]


@router.post("/analyse", response_model=DisputeAnalysisResponse)
async def analyse_dispute(req: DisputeAnalysisRequest):
    """
    Full AI dispute analysis reading your real audit log, bids, and payments.
    Call when an admin opens a dispute ticket.
    """
    conn = get_conn()
    try:
        cur = conn.cursor()

        # Fetch auction details
        cur.execute("""
            SELECT a.title, a.status, a."currentPrice", a."reservePrice",
                   a."endTime", a."sellerId", a."winnerId",
                   seller.name AS seller_name, seller.email AS seller_email,
                   seller."reputationScore" AS seller_rep,
                   winner.name AS winner_name, winner.email AS winner_email,
                   winner."reputationScore" AS winner_rep
            FROM "Auction" a
            LEFT JOIN "User" seller ON seller.id = a."sellerId"
            LEFT JOIN "User" winner ON winner.id = a."winnerId"
            WHERE a.id = %s
        """, [req.auction_id])
        auc = cur.fetchone()
        if not auc:
            raise HTTPException(404, "Auction not found")

        title, status, final_price, reserve, end_time, seller_id, winner_id, \
            seller_name, seller_email, seller_rep, winner_name, winner_email, winner_rep = auc

        # Fetch full bid history
        cur.execute("""
            SELECT b.amount, b."createdAt", b."bidderId",
                   u.name, b."fraudScore", b."isAutobid"
            FROM "Bid" b
            JOIN "User" u ON u.id = b."bidderId"
            WHERE b."auctionId" = %s
            ORDER BY b."createdAt"
        """, [req.auction_id])
        bids = cur.fetchall()

        # Fetch audit log
        cur.execute("""
            SELECT action, entity, "createdAt", snapshot, "actorIp"
            FROM "AuditLog"
            WHERE "auctionId" = %s
            ORDER BY "createdAt"
        """, [req.auction_id])
        audit_rows = cur.fetchall()

        # Fetch payment info
        cur.execute("""
            SELECT status, amount, currency, "stripePaymentIntentId",
                   "createdAt", "updatedAt"
            FROM "Payment"
            WHERE "auctionId" = %s
            ORDER BY "createdAt" DESC LIMIT 1
        """, [req.auction_id])
        payment = cur.fetchone()

    finally:
        conn.close()

    # Build timeline
    timeline = []
    for row in audit_rows:
        action, entity, created_at, snapshot, actor_ip = row
        timeline.append({
            "time": created_at.isoformat() if created_at else None,
            "event": action,
            "entity": entity,
            "details": snapshot if isinstance(snapshot, dict) else {},
        })

    # Key facts
    key_facts = [
        f"Auction: '{title}' — final price ${float(final_price):,.0f} (reserve ${float(reserve):,.0f})",
        f"Seller: {seller_name} ({seller_email}) — reputation {seller_rep:.1f}/5",
        f"Winner: {winner_name} ({winner_email}) — reputation {winner_rep:.1f}/5" if winner_name else "No winner",
        f"Total bids: {len(bids)}",
        f"Payment status: {payment[0] if payment else 'None'}",
        f"Auction ended: {end_time.isoformat() if end_time else 'Unknown'}",
    ]

    # Check for fraud signals
    high_fraud_bids = [b for b in bids if b[4] and float(b[4]) > 0.7]
    if high_fraud_bids:
        key_facts.append(f"⚠ {len(high_fraud_bids)} bids flagged with high fraud score (>{0.7})")

    # Evidence sorting
    evidence_buyer = []
    evidence_seller = []

    if payment and payment[0] == "SUCCEEDED":
        evidence_buyer.append("Payment was successfully processed")
    if payment and payment[0] == "FAILED":
        evidence_seller.append("Payment failed — buyer did not complete transaction")
    if high_fraud_bids:
        evidence_buyer.append(f"{len(high_fraud_bids)} suspicious bids detected — possible shill bidding")
    if winner_rep and float(winner_rep) >= 4.5:
        evidence_seller.append(f"Winner has strong reputation score ({winner_rep:.1f}/5)")
    if seller_rep and float(seller_rep) >= 4.5:
        evidence_buyer.append(f"Seller has strong reputation score ({seller_rep:.1f}/5)")

    # Build context for Claude
    bid_summary = "\n".join([
        f"  {b[1].strftime('%H:%M:%S')} — ${float(b[0]):,.0f} by {b[3]}"
        + (" [FRAUD FLAG]" if b[4] and float(b[4]) > 0.7 else "")
        + (" [AUTOBID]" if b[5] else "")
        for b in bids[-10:]  # last 10 bids
    ])

    audit_summary = "\n".join([
        f"  {t['time'][:19] if t['time'] else 'N/A'} — {t['event']}"
        for t in timeline[-15:]
    ])

    context = f"""
AUCTION: {title}
Status: {status} | Final: ${float(final_price):,.0f} | Reserve: ${float(reserve):,.0f}
Seller: {seller_name} (rep: {seller_rep:.1f}) | Winner: {winner_name or 'None'} (rep: {winner_rep:.1f if winner_rep else 0})
Payment: {payment[0] if payment else 'None'} | Amount: ${float(payment[1]):,.0f if payment else 0}

DISPUTE filed by: {req.filed_by}
Reason: {req.dispute_reason}

LAST 10 BIDS:
{bid_summary}

AUDIT TRAIL (last 15 events):
{audit_summary}

HIGH FRAUD BIDS: {len(high_fraud_bids)}
"""

    # Default resolution (fallback if no API key)
    recommended = "escalate"
    reasoning   = "Insufficient data for automatic resolution — manual review required."
    case_summary = f"Dispute filed by {req.filed_by} for auction '{title}'. {req.dispute_reason}"
    confidence   = "low"

    if ANTHROPIC_KEY:
        try:
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
                        "max_tokens": 600,
                        "messages": [{
                            "role": "user",
                            "content": f"""You are a senior dispute resolution officer at a premium auction house.
Analyse this dispute and respond ONLY with JSON (no markdown):
{{
  "case_summary": "2-sentence neutral case summary",
  "recommended_resolution": "refund_buyer|release_to_seller|partial_refund|escalate",
  "confidence": "high|medium|low",
  "reasoning": "3-sentence explanation of your recommendation"
}}

Resolution guide:
- refund_buyer: payment made but seller fraud/misrepresentation confirmed
- release_to_seller: buyer won fairly, payment received, no seller wrongdoing
- partial_refund: item not as described but transaction largely legitimate
- escalate: complex case requiring human legal review

{context}"""
                        }],
                    },
                )
            if resp.status_code == 200:
                raw = resp.json()["content"][0]["text"].strip()
                parsed = json.loads(raw)
                case_summary = parsed.get("case_summary", case_summary)
                recommended  = parsed.get("recommended_resolution", recommended)
                confidence   = parsed.get("confidence", confidence)
                reasoning    = parsed.get("reasoning", reasoning)
        except Exception:
            pass

    return DisputeAnalysisResponse(
        case_summary=case_summary,
        timeline=timeline,
        key_facts=key_facts,
        recommended_resolution=recommended,
        confidence=confidence,
        reasoning=reasoning,
        evidence_for_buyer=evidence_buyer,
        evidence_for_seller=evidence_seller,
    )
