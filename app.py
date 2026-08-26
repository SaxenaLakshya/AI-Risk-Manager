"""
Return-Risk Scorer API -- full pipeline:
    order in -> preprocessor -> XGBoost + AdaBoost ensemble -> confidence check
    -> if uncertain: pull customer history from Postgres -> Groq SLM review
    -> return score + (if applicable) SLM rationale/recommendation

Folder layout expected:
    app.py                 <- this file
    get_history.py
    slm_review.py
    artifacts/
        preprocessor.pkl
        xgb_model.json      <- XGBoost native format (see earlier fix)
        ada_model.pkl
        label_map.pkl

Run locally:
    uvicorn app:app --reload --port 8000
"""

import os
import joblib
import pandas as pd
import xgboost as xgb
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from dotenv import load_dotenv

from get_history import get_customer_history
from slm_review import get_slm_feedback
from confident_summary import build_confident_summary

load_dotenv()

# ---------------------------------------------------------------------------
# Load artifacts once at startup
# ---------------------------------------------------------------------------
ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "artifacts")

preprocessor = joblib.load(os.path.join(ARTIFACT_DIR, "preprocessor.pkl"))

xgb_model = xgb.XGBClassifier()
xgb_model.load_model(os.path.join(ARTIFACT_DIR, "xgb_model.json"))

ada_model = joblib.load(os.path.join(ARTIFACT_DIR, "ada_model.pkl"))
label_map = joblib.load(os.path.join(ARTIFACT_DIR, "label_map.pkl"))

UNCERTAIN_THRESHOLD = 0.60

app = FastAPI(title="Return-Risk Scorer API", version="1.1")


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------
class OrderInput(BaseModel):
    customer_id: str  # needed to look up history for the SLM layer
    age: int
    account_age_days: int
    customer_segment: str
    platform: str
    device_type: str
    payment_method: str
    product_category: str
    avg_order_value_usd: float
    refund_amount_requested_usd: float
    is_high_value_item: int = Field(ge=0, le=1)
    discount_used: int = Field(ge=0, le=1)
    item_returned_opened: int = Field(ge=0, le=1)
    return_packaging_intact: int = Field(ge=0, le=1)
    photo_evidence_provided: int = Field(ge=0, le=1)
    tracking_number_valid: int = Field(ge=0, le=1)
    shipping_carrier: str
    address_change_before_delivery: int = Field(ge=0, le=1)
    refund_to_different_account: int = Field(ge=0, le=1)
    multiple_accounts_flag: int = Field(ge=0, le=1)
    customer_support_contacts: int
    previous_dispute_count: int
    wishlist_to_cart_time_hrs: float
    return_reason: Optional[str] = None


class ScoreResponse(BaseModel):
    predicted_class: str
    confidence: float
    is_uncertain: bool
    class_probabilities: dict
    slm_rationale: Optional[str] = None
    slm_recommendation: Optional[str] = None
    slm_key_factor: Optional[str] = None
    explanation_source: Optional[str] = None  # "rule_based" or "slm"


# ---------------------------------------------------------------------------
# Core scoring logic
# ---------------------------------------------------------------------------
def score_order(order: OrderInput) -> ScoreResponse:
    model_input = order.dict(exclude={"return_reason", "customer_id"})
    df = pd.DataFrame([model_input])

    try:
        X_new = preprocessor.transform(df)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Preprocessing failed -- check category values are valid: {str(e)}"
        )

    proba_xgb = xgb_model.predict_proba(X_new)
    proba_ada = ada_model.predict_proba(X_new)
    avg_proba = (proba_xgb + proba_ada) / 2

    pred_idx = int(avg_proba.argmax(axis=1)[0])
    predicted_class = label_map[pred_idx]
    confidence = float(avg_proba.max(axis=1)[0])
    model_is_uncertain = confidence < UNCERTAIN_THRESHOLD

    class_probs = {label_map[i]: round(float(avg_proba[0][i]), 4) for i in label_map}

    model_result = {
        "predicted_class": predicted_class,
        "confidence": round(confidence, 4),
        "class_probabilities": class_probs,
    }

    # ---------------------------------------------------------------
    # Always pull history first -- it's a cheap DB query, and we need
    # it to decide whether a HISTORY-BASED override applies, not just
    # the model's own confidence.
    # ---------------------------------------------------------------
    history = None
    history_error = None
    try:
        history = get_customer_history(order.customer_id)
    except Exception as e:
        history_error = str(e)

    HISTORY_RETURN_RATE_THRESHOLD = 50.0  # % -- force review above this
    history_flags_risk = False
    history_override_reason = None

    if history and not history.get("is_new_customer") and not history_error:
        stats = history["summary_stats"]
        if stats["return_rate_pct"] > HISTORY_RETURN_RATE_THRESHOLD:
            history_flags_risk = True
            history_override_reason = f"customer return rate {stats['return_rate_pct']}% exceeds threshold"
        elif stats["flagged_returns_lifetime"] > 0:
            history_flags_risk = True
            history_override_reason = f"{stats['flagged_returns_lifetime']} prior flagged return(s) on record"

    # Final uncertainty decision: model says unsure, OR history says "check anyway"
    is_uncertain = model_is_uncertain or history_flags_risk

    if is_uncertain:
        # Genuinely worth the cost of full SLM reasoning -- either the model
        # is unsure, or the customer's history warrants a second look
        try:
            if history is None:
                raise RuntimeError(history_error or "history unavailable")
            feedback = get_slm_feedback(model_input, model_result, history)
            explanation = {
                "rationale": feedback.get("rationale") or None,
                "recommendation": feedback.get("recommendation") or None,
                "key_factor": feedback.get("key_factor") or None,
                "source": "slm",
            }
            if history_flags_risk and not model_is_uncertain:
                # Note in the rationale WHY the SLM got involved despite model confidence
                explanation["rationale"] = (
                    f"[Escalated due to customer history: {history_override_reason}] "
                    + (explanation["rationale"] or "")
                )
        except Exception as e:
            explanation = {
                "rationale": f"SLM review unavailable: {str(e)}",
                "recommendation": None,
                "key_factor": None,
                "source": "slm_error",
            }
    else:
        # Confident AND clean history -- cheap templated summary, no LLM call
        explanation = build_confident_summary(model_input, model_result)

    return ScoreResponse(
        predicted_class=predicted_class,
        confidence=round(confidence, 4),
        is_uncertain=is_uncertain,
        class_probabilities=class_probs,
        slm_rationale=explanation.get("rationale"),
        slm_recommendation=explanation.get("recommendation"),
        slm_key_factor=explanation.get("key_factor"),
        explanation_source=explanation.get("source"),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/score-order", response_model=ScoreResponse)
def score_order_endpoint(order: OrderInput):
    return score_order(order)