"""
FastAPI service for the Return-Risk Scorer.

Folder layout expected:
    app.py                 <- this file
    artifacts/
        preprocessor.pkl
        xgb_model.pkl
        ada_model.pkl
        label_map.pkl

Run locally:
    uvicorn app:app --reload --port 8000

Test:
    POST http://localhost:8000/score-order
"""

import os
import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import xgboost as xgb

# ---------------------------------------------------------------------------
# Load artifacts once at startup (not per-request)
# ---------------------------------------------------------------------------
ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "artifacts")

preprocessor = joblib.load(os.path.join(ARTIFACT_DIR, "preprocessor.pkl"))
xgb_model = xgb.XGBClassifier()
xgb_model.load_model(os.path.join(ARTIFACT_DIR, "xgb_model.json"))
ada_model = joblib.load(os.path.join(ARTIFACT_DIR, "ada_model.pkl"))
label_map = joblib.load(os.path.join(ARTIFACT_DIR, "label_map.pkl"))

UNCERTAIN_THRESHOLD = 0.60

app = FastAPI(title="Return-Risk Scorer API", version="1.0")


# ---------------------------------------------------------------------------
# Request schema -- mirrors your 22 training features exactly
# ---------------------------------------------------------------------------
class OrderInput(BaseModel):
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

    # Optional free-text field, useful later for the Claude layer
    return_reason: Optional[str] = None


class ScoreResponse(BaseModel):
    predicted_class: str
    confidence: float
    is_uncertain: bool
    class_probabilities: dict


# ---------------------------------------------------------------------------
# Core scoring logic
# ---------------------------------------------------------------------------
def score_order(order: OrderInput) -> ScoreResponse:
    data = order.dict(exclude={"return_reason"})
    df = pd.DataFrame([data])

    try:
        X_new = preprocessor.transform(df)
    except Exception as e:
        # Most common cause: a category value the encoder never saw during training
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
    is_uncertain = confidence < UNCERTAIN_THRESHOLD

    class_probs = {label_map[i]: round(float(avg_proba[0][i]), 4) for i in label_map}

    return ScoreResponse(
        predicted_class=predicted_class,
        confidence=round(confidence, 4),
        is_uncertain=is_uncertain,
        class_probabilities=class_probs,
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