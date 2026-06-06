# ai-service/app/routes/emails.py
# Personalised post-auction email generator.
# Winner gets payment instructions + 3 similar auctions they'll love.
# Seller gets a performance breakdown with next-auction tips.
# Uses Claude for narrative copy. Falls back to templated text if no API key.

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import os, psycopg2, httpx, json

router = APIRouter(prefix="/emails", tags=["emails"])
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL  = "claude-sonnet-4-20250514"

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


class WinnerEmailRequest(BaseModel):
    auction_id: str
    winner_id: str


class SellerEmailRequest(BaseModel):
    auction_id: str
    seller_id: str


class EmailContent(BaseModel):
    subject: str
    html_body: str          # full HTML — drop into your email provider (SendGrid, SES, etc.)
    plain_text: str         # plain text fallback
    personalisation_score: str  # high | medium | low (based on available data)


@router.post("/winner", response_model=EmailContent)
async def winner_email(req: WinnerEmailRequest):
    """
    Generates personalised winner email with:
    - Congratulations + final price
    - Payment instructions + deadline
    - Seller profile snippet
    - 3 recommended upcoming auctions (TanStack Query fetches from your listings API)
    """
    conn = get_conn()
    try:
        cur = conn.cursor()

        cur.execute("""
            SELECT a.title, a."currentPrice", a."endTime", a.category,
                   a."imageUrls",
                   seller.name AS seller_name, seller.email AS seller_email,
                   seller."reputationScore",
                   winner.name AS winner_name, winner.email AS winner_email
            FROM "Auction" a
            JOIN "User" seller ON seller.id = a."sellerId"
            JOIN "User" winner ON winner.id = %s
            WHERE a.id = %s AND a."winnerId" = %s
        """, [req.winner_id, req.auction_id, req.winner_id])
        row = cur.fetchone()
        if not row:
            from fastapi import HTTPException
            raise HTTPException(404, "Auction/winner not found")

        title, price, end_time, category, images, seller_name, seller_email, \
            seller_rep, winner_name, winner_email = row

        # Recommended auctions in the same category
        cur.execute("""
            SELECT id, title, "currentPrice", "endTime"
            FROM "Auction"
            WHERE category = %s
              AND status = 'ACTIVE'
              AND "winnerId" IS NULL
              AND id != %s
            ORDER BY "endTime" ASC LIMIT 3
        """, [category, req.auction_id])
        recs = cur.fetchall()

    finally:
        conn.close()

    price_fmt = f"${float(price):,.0f}"
    deadline  = "48 hours"
    thumb     = images[0] if images else ""

    # Build recommended auction HTML
    rec_html = ""
    for r in recs:
        rec_html += f"""
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
            <a href="{os.getenv('FRONTEND_URL','https://yourdomain.com')}/auctions/{r[0]}"
               style="color:#111;text-decoration:none;font-size:14px;">{r[1]}</a>
            <span style="color:#666;font-size:13px;margin-left:8px;">${float(r[2]):,.0f}</span>
          </td>
        </tr>"""

    # Default subject + body
    subject = f"🎉 Congratulations — you won '{title}'"
    plain   = (
        f"Hi {winner_name},\n\n"
        f"Congratulations! You won '{title}' for {price_fmt}.\n\n"
        f"Please complete payment within {deadline} to secure your item.\n"
        f"Seller: {seller_name} (rated {seller_rep:.1f}/5)\n\n"
        f"Pay now: {os.getenv('FRONTEND_URL','https://yourdomain.com')}/pay/{req.auction_id}\n\n"
        f"BidSpace Team"
    )

    # Claude personalised opening line
    opening = f"Congratulations {winner_name} — your winning bid of {price_fmt} secured '{title}'."
    if ANTHROPIC_KEY:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={
                        "model": CLAUDE_MODEL, "max_tokens": 80,
                        "messages": [{"role": "user", "content":
                            f"Write 1 warm, personalised congratulations sentence for an auction winner. "
                            f"Name: {winner_name} | Item: {title} | Category: {category} | Price: {price_fmt}. "
                            f"Be genuine and specific. No emoji. Max 25 words."
                        }],
                    },
                )
            if resp.status_code == 200:
                opening = resp.json()["content"][0]["text"].strip()
        except Exception:
            pass

    pay_url = f"{os.getenv('FRONTEND_URL','https://yourdomain.com')}/pay/{req.auction_id}"

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;margin:0;padding:0;background:#f9f9f9}}
.wrap{{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5}}
.hero{{background:#111;padding:32px;text-align:center;color:#fff}}
.content{{padding:28px 32px}}
.btn{{display:inline-block;background:#111;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:500;font-size:15px;margin:20px 0}}
.stat{{display:inline-block;background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:12px 20px;margin:4px;text-align:center}}
.stat-n{{font-size:20px;font-weight:600;color:#111}}
.stat-l{{font-size:11px;color:#666;margin-top:2px}}
.footer{{padding:20px 32px;border-top:1px solid #f0f0f0;text-align:center;color:#999;font-size:12px}}
</style></head>
<body><div class="wrap">
  <div class="hero">
    <div style="font-size:32px;margin-bottom:12px">🏆</div>
    <h1 style="margin:0;font-size:22px;font-weight:600">You won!</h1>
    <p style="margin:8px 0 0;opacity:0.7;font-size:14px">{title}</p>
  </div>
  <div class="content">
    <p style="font-size:15px;line-height:1.6;margin-top:0">{opening}</p>
    <div style="margin:20px 0">
      <div class="stat"><div class="stat-n">{price_fmt}</div><div class="stat-l">Final price</div></div>
      <div class="stat"><div class="stat-n">{deadline}</div><div class="stat-l">Payment deadline</div></div>
      <div class="stat"><div class="stat-n">{seller_rep:.1f}/5</div><div class="stat-l">Seller rating</div></div>
    </div>
    <div style="background:#FEF9ED;border:1px solid #FCD34D;border-radius:8px;padding:14px 18px;margin:20px 0">
      <strong style="font-size:14px">⏰ Complete payment within {deadline}</strong>
      <p style="margin:6px 0 0;font-size:13px;color:#666">Your item is reserved. Complete payment to confirm.</p>
    </div>
    <a href="{pay_url}" class="btn">Complete payment →</a>
    <p style="font-size:13px;color:#666;margin-top:4px">Or visit: <a href="{pay_url}" style="color:#111">{pay_url}</a></p>
    <div style="margin-top:24px;border-top:1px solid #f0f0f0;padding-top:20px">
      <p style="font-size:13px;font-weight:500;margin-bottom:12px">Seller: {seller_name} · {seller_rep:.1f}★</p>
    </div>
    {f'''<div style="margin-top:20px"><p style="font-size:13px;font-weight:500;margin-bottom:8px">You might also like</p>
    <table width="100%" cellpadding="0" cellspacing="0">{rec_html}</table></div>''' if rec_html else ""}
  </div>
  <div class="footer">BidSpace · <a href="#" style="color:#999">Unsubscribe</a></div>
</div></body></html>"""

    return EmailContent(
        subject=subject,
        html_body=html,
        plain_text=plain,
        personalisation_score="high" if ANTHROPIC_KEY else "medium",
    )


@router.post("/seller-recap", response_model=EmailContent)
async def seller_recap_email(req: SellerEmailRequest):
    """
    Seller post-auction recap:
    - Final price vs reserve (did they win?)
    - Bid count + watcher count
    - AI performance tip for next listing
    - Payout timeline
    """
    conn = get_conn()
    try:
        cur = conn.cursor()

        cur.execute("""
            SELECT a.title, a.status, a."currentPrice", a."reservePrice",
                   a."endTime", a.category, a.condition,
                   COUNT(b.id) AS bid_count,
                   MAX(b.amount) AS highest_bid,
                   seller.name, seller.email,
                   winner.name AS winner_name
            FROM "Auction" a
            LEFT JOIN "Bid" b ON b."auctionId" = a.id
            LEFT JOIN "User" seller ON seller.id = a."sellerId"
            LEFT JOIN "User" winner ON winner.id = a."winnerId"
            WHERE a.id = %s AND a."sellerId" = %s
            GROUP BY a.id, seller.id, winner.name
        """, [req.auction_id, req.seller_id])
        row = cur.fetchone()
        if not row:
            from fastapi import HTTPException
            raise HTTPException(404, "Auction not found")

        title, status, final_price, reserve, end_time, category, condition, \
            bid_count, highest_bid, seller_name, seller_email, winner_name = row

        final_price = float(final_price or 0)
        reserve     = float(reserve or 0)
        highest_bid = float(highest_bid or 0)
        sold        = status == "CLOSED" and winner_name is not None
        vs_reserve  = round((final_price - reserve) / reserve * 100, 1) if reserve else 0
        commission  = round(final_price * 0.08, 2)  # 8% seller fee
        payout      = round(final_price - commission, 2)

    finally:
        conn.close()

    subject = (
        f"✅ Sold for {f'${final_price:,.0f}'} — '{title}'" if sold
        else f"Reserve not met — '{title}' · relist tips inside"
    )

    # AI tip
    tip = "Consider starting lower to build bid momentum — auctions with early bids attract more attention."
    if ANTHROPIC_KEY:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={
                        "model": CLAUDE_MODEL, "max_tokens": 80,
                        "messages": [{"role": "user", "content":
                            f"Write 1 specific, actionable auction performance tip for a seller. "
                            f"Item: {title} | Category: {category} | Final: ${final_price:,.0f} | Reserve: ${reserve:,.0f} | "
                            f"Bids: {bid_count} | Sold: {sold}. Max 30 words. No emoji."
                        }],
                    },
                )
            if resp.status_code == 200:
                tip = resp.json()["content"][0]["text"].strip()
        except Exception:
            pass

    plain = (
        f"Hi {seller_name},\n\n"
        f"{'Your item sold!' if sold else 'Your auction ended without meeting reserve.'}\n\n"
        f"Item: {title}\n"
        f"Final price: ${final_price:,.0f} (reserve: ${reserve:,.0f}, {vs_reserve:+.1f}%)\n"
        f"Bids received: {bid_count}\n"
        + (f"Payout (after 8% commission): ${payout:,.0f}\n" if sold else "")
        + f"\nTip: {tip}\n\nBidSpace Team"
    )

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;margin:0;padding:0;background:#f9f9f9}}
.wrap{{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5}}
.hero{{background:{'#111' if sold else '#6B7280'};padding:28px;color:#fff;text-align:center}}
.content{{padding:28px 32px}}
.stat{{display:inline-block;background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:10px 18px;margin:4px;text-align:center}}
.stat-n{{font-size:18px;font-weight:600}}
.stat-l{{font-size:11px;color:#666;margin-top:2px}}
.tip{{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:14px 18px;margin:20px 0}}
.footer{{padding:20px 32px;border-top:1px solid #f0f0f0;text-align:center;color:#999;font-size:12px}}
</style></head>
<body><div class="wrap">
  <div class="hero">
    <div style="font-size:28px;margin-bottom:8px">{'✅' if sold else '📋'}</div>
    <h1 style="margin:0;font-size:20px">{'Item sold!' if sold else 'Auction ended'}</h1>
    <p style="margin:6px 0 0;opacity:0.7;font-size:13px">{title}</p>
  </div>
  <div class="content">
    <div style="margin-bottom:20px">
      <div class="stat"><div class="stat-n">${final_price:,.0f}</div><div class="stat-l">Final price</div></div>
      <div class="stat"><div class="stat-n">{vs_reserve:+.1f}%</div><div class="stat-l">vs reserve</div></div>
      <div class="stat"><div class="stat-n">{int(bid_count)}</div><div class="stat-l">Bids</div></div>
      {f'<div class="stat"><div class="stat-n">${payout:,.0f}</div><div class="stat-l">Your payout</div></div>' if sold else ''}
    </div>
    {f'<p style="font-size:14px;color:#666">Buyer: {winner_name} · Payout within 3–5 business days after payment</p>' if sold else ''}
    <div class="tip">
      <strong style="font-size:13px">💡 AI tip for your next listing</strong>
      <p style="margin:6px 0 0;font-size:13px;color:#444">{tip}</p>
    </div>
    {f'<a href="{os.getenv("FRONTEND_URL","https://yourdomain.com")}/listings/{req.auction_id}/relist" style="display:inline-block;background:#111;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">Relist this item →</a>' if not sold else ''}
  </div>
  <div class="footer">BidSpace · <a href="#" style="color:#999">Unsubscribe</a></div>
</div></body></html>"""

    return EmailContent(
        subject=subject,
        html_body=html,
        plain_text=plain,
        personalisation_score="high" if ANTHROPIC_KEY else "medium",
    )
