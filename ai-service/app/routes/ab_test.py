# ai-service/app/routes/ab_test.py
# Multi-armed bandit A/B test framework for notification copy variants.
# Uses epsilon-greedy strategy — exploits best-performing variant 90% of time,
# explores others 10% to keep learning.
# Tracks: impressions, clicks, bid conversions per variant.

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import os, psycopg2, json, random
from datetime import datetime, timezone
from pathlib import Path

router = APIRouter(prefix="/ab", tags=["ab-testing"])

MODELS_DIR = Path(__file__).parent.parent.parent / "models"
AB_STATE_PATH = MODELS_DIR / "ab_state.json"

# ── Default test: outbid notification copy ────────────────────────
DEFAULT_TESTS = {
    "outbid_notification": {
        "description": "Outbid push notification copy variants",
        "variants": {
            "control": {
                "name": "Standard",
                "template": "You were outbid on {title}. Current price: ${price}.",
            },
            "urgent": {
                "name": "Urgency",
                "template": "⏱ Only {time_left} left! Someone outbid you on {title} by ${gap}.",
            },
            "social": {
                "name": "Social proof",
                "template": "{watchers} people watching '{title}' — you've been outbid. Don't let it go!",
            },
            "value": {
                "name": "Value framing",
                "template": "Great deal slipping away: '{title}' at ${price} — still under estimated value.",
            },
        },
        "epsilon": 0.10,      # 10% exploration rate
        "metric": "bid_conversion",  # what we're optimising for
    },
    "winback_email": {
        "description": "Winback email subject line variants",
        "variants": {
            "control":   {"name": "Standard",    "template": "Auctions you might like"},
            "fomo":      {"name": "FOMO",         "template": "These {category} auctions won't last long"},
            "personal":  {"name": "Personalised", "template": "Hi {name} — {category} prices are up this week"},
            "savings":   {"name": "Savings",      "template": "{count} {category} auctions ending this week"},
        },
        "epsilon": 0.15,
        "metric": "email_open",
    },
}


def load_state() -> dict:
    if AB_STATE_PATH.exists():
        return json.loads(AB_STATE_PATH.read_text())
    # Initialise with zero counts
    state = {}
    for test_id, test in DEFAULT_TESTS.items():
        state[test_id] = {
            variant_id: {"impressions": 0, "conversions": 0}
            for variant_id in test["variants"]
        }
    return state


def save_state(state: dict):
    MODELS_DIR.mkdir(exist_ok=True)
    AB_STATE_PATH.write_text(json.dumps(state, indent=2))


# ── API models ────────────────────────────────────────────────────

class AssignRequest(BaseModel):
    test_id: str
    user_id: str
    context: dict = {}         # template variables: title, price, time_left, etc.


class AssignResponse(BaseModel):
    test_id: str
    variant_id: str
    variant_name: str
    message: str               # rendered template with context filled in
    assignment_id: str         # pass back when recording conversion


class ConversionRequest(BaseModel):
    test_id: str
    variant_id: str
    user_id: str
    converted: bool            # True = bid placed / email opened


class TestResults(BaseModel):
    test_id: str
    description: str
    variants: list[dict]
    winner: Optional[str]
    total_impressions: int
    confidence: str


# ── Epsilon-greedy assignment ─────────────────────────────────────

@router.post("/assign", response_model=AssignResponse)
def assign_variant(req: AssignRequest):
    """
    Returns the best-performing variant (epsilon-greedy).
    Call before sending any notification or email.
    """
    test = DEFAULT_TESTS.get(req.test_id)
    if not test:
        return AssignResponse(
            test_id=req.test_id, variant_id="control", variant_name="Control",
            message=req.context.get("default_message", ""),
            assignment_id=f"{req.test_id}:control:{req.user_id}",
        )

    state = load_state()
    test_state = state.get(req.test_id, {})

    # Epsilon-greedy: explore randomly epsilon% of the time
    if random.random() < test["epsilon"] or not test_state:
        variant_id = random.choice(list(test["variants"].keys()))
    else:
        # Exploit: pick variant with highest conversion rate
        def conv_rate(vid: str) -> float:
            s = test_state.get(vid, {"impressions": 0, "conversions": 0})
            imps = s["impressions"]
            return s["conversions"] / imps if imps > 0 else 0.5  # UCB-like prior

        variant_id = max(test["variants"].keys(), key=conv_rate)

    # Record impression
    if req.test_id not in state:
        state[req.test_id] = {}
    if variant_id not in state[req.test_id]:
        state[req.test_id][variant_id] = {"impressions": 0, "conversions": 0}
    state[req.test_id][variant_id]["impressions"] += 1
    save_state(state)

    # Render template
    variant = test["variants"][variant_id]
    template = variant["template"]
    try:
        message = template.format(**req.context)
    except KeyError:
        message = template  # use raw if context vars missing

    return AssignResponse(
        test_id=req.test_id,
        variant_id=variant_id,
        variant_name=variant["name"],
        message=message,
        assignment_id=f"{req.test_id}:{variant_id}:{req.user_id}",
    )


@router.post("/convert")
def record_conversion(req: ConversionRequest):
    """Record whether the assigned variant led to a conversion (bid/open/click)."""
    state = load_state()
    if req.test_id not in state:
        state[req.test_id] = {}
    if req.variant_id not in state[req.test_id]:
        state[req.test_id][req.variant_id] = {"impressions": 0, "conversions": 0}

    if req.converted:
        state[req.test_id][req.variant_id]["conversions"] += 1

    save_state(state)
    return {"recorded": True}


@router.get("/results/{test_id}", response_model=TestResults)
def get_results(test_id: str):
    """View current test results with conversion rates per variant."""
    test  = DEFAULT_TESTS.get(test_id)
    state = load_state()
    test_state = state.get(test_id, {})

    if not test:
        from fastapi import HTTPException
        raise HTTPException(404, f"Test '{test_id}' not found")

    variants = []
    best_rate = 0.0
    winner = None
    total_impressions = 0

    for vid, variant in test["variants"].items():
        s = test_state.get(vid, {"impressions": 0, "conversions": 0})
        imps = s["impressions"]
        convs = s["conversions"]
        rate = convs / imps if imps > 0 else 0.0
        total_impressions += imps

        variants.append({
            "id":              vid,
            "name":            variant["name"],
            "impressions":     imps,
            "conversions":     convs,
            "conversion_rate": round(rate * 100, 2),
            "template":        variant["template"],
        })

        if rate > best_rate and imps >= 20:  # need 20+ impressions to declare winner
            best_rate = rate
            winner = vid

    # Sort by conversion rate
    variants.sort(key=lambda v: v["conversion_rate"], reverse=True)

    confidence = (
        "high"   if total_impressions >= 200
        else "medium" if total_impressions >= 50
        else "low"
    )

    return TestResults(
        test_id=test_id,
        description=test["description"],
        variants=variants,
        winner=winner,
        total_impressions=total_impressions,
        confidence=confidence,
    )


@router.get("/tests")
def list_tests():
    """List all active A/B tests."""
    state = load_state()
    return [
        {
            "test_id": tid,
            "description": t["description"],
            "variant_count": len(t["variants"]),
            "total_impressions": sum(
                state.get(tid, {}).get(vid, {}).get("impressions", 0)
                for vid in t["variants"]
            ),
        }
        for tid, t in DEFAULT_TESTS.items()
    ]
