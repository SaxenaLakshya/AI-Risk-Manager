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

from get_history import get_customer_history, engine
from slm_review import get_slm_feedback
from confident_summary import build_confident_summary
from sqlalchemy import text
import uuid
from datetime import datetime, date
import json

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

app = FastAPI(title="Return-Risk Scorer API", version="1.2")

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # add your deployed frontend URL here too
    allow_methods=["*"],
    allow_headers=["*"],
)


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


# ---------------------------------------------------------------------------
# Public submission flow -- scores the order, and if it's uncertain, queues
# it in pending_requests for a vendor to review. Confident cases resolve
# immediately and are never written here (nothing for a vendor to do).
# ---------------------------------------------------------------------------
class SubmitOrderResponse(ScoreResponse):
    request_id: Optional[str] = None
    queued_for_review: bool = False


@app.post("/submit-order", response_model=SubmitOrderResponse)
def submit_order_endpoint(order: OrderInput):
    score = score_order(order)

    request_id = None
    if score.is_uncertain:
        request_id = f"REQ{uuid.uuid4().hex[:8].upper()}"
        try:
            with engine.begin() as conn:
                conn.execute(text("""
                    INSERT INTO pending_requests
                        (request_id, customer_id, submitted_at, order_json,
                         predicted_class, confidence, class_probabilities,
                         slm_rationale, slm_recommendation, slm_key_factor,
                         explanation_source, status)
                    VALUES
                        (:request_id, :customer_id, :submitted_at, CAST(:order_json AS JSONB),
                         :predicted_class, :confidence, CAST(:class_probabilities AS JSONB),
                         :slm_rationale, :slm_recommendation, :slm_key_factor,
                         :explanation_source, 'pending')
                """), {
                    "request_id": request_id,
                    "customer_id": order.customer_id,
                    "submitted_at": datetime.now().isoformat(),
                    "order_json": json.dumps(order.dict()),
                    "predicted_class": score.predicted_class,
                    "confidence": score.confidence,
                    "class_probabilities": json.dumps(score.class_probabilities),
                    "slm_rationale": score.slm_rationale,
                    "slm_recommendation": score.slm_recommendation,
                    "slm_key_factor": score.slm_key_factor,
                    "explanation_source": score.explanation_source,
                })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to queue request: {str(e)}")

    return SubmitOrderResponse(**score.dict(), request_id=request_id, queued_for_review=bool(request_id))


@app.get("/pending-requests")
def get_pending_requests():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT request_id, customer_id, submitted_at, order_json,
                   predicted_class, confidence, class_probabilities,
                   slm_rationale, slm_recommendation, slm_key_factor, explanation_source
            FROM pending_requests
            WHERE status = 'pending'
            ORDER BY submitted_at ASC
        """)).mappings().all()

    results = []
    for r in rows:
        row = dict(r)
        # JSONB columns usually deserialize to dict already; fall back to json.loads if not
        for key in ("order_json", "class_probabilities"):
            if isinstance(row[key], str):
                row[key] = json.loads(row[key])
        row["submitted_at"] = row["submitted_at"].isoformat() if hasattr(row["submitted_at"], "isoformat") else row["submitted_at"]
        results.append(row)
    return results


# ---------------------------------------------------------------------------
# Vendor decision -- closes the feedback loop by writing the outcome
# back into the historical database (customers/orders/returns).
# ---------------------------------------------------------------------------
VALID_ABUSE_TYPES = {"Legitimate", "Policy Abuser", "Fraudulent Return", "Wardrobing"}
VALID_DECISIONS = {"approved", "rejected"}

ORDER_DEFAULTS = dict(
    platform="Web Browser", device_type="Windows PC", payment_method="Credit Card",
    is_high_value_item=0, discount_used=0, shipping_carrier="USPS",
    tracking_number_valid=1, address_change_before_delivery=0,
)
CUSTOMER_DEFAULTS = dict(
    age=30, account_age_days=30, customer_segment="New", country="IN",
    multiple_accounts_flag=0, customer_support_contacts=0,
)


class VendorDecisionInput(BaseModel):
    order_id: str
    customer_id: str
    order_date: str  # "YYYY-MM-DD"
    product_category: str
    order_amount: float
    return_reason: Optional[str] = "Not specified"
    days_to_return: Optional[int] = 0
    item_returned_opened: int = Field(ge=0, le=1)
    return_packaging_intact: int = Field(ge=0, le=1)
    photo_evidence_provided: int = Field(ge=0, le=1)
    refund_to_different_account: int = Field(ge=0, le=1)
    vendor_decision: str  # "approved" | "rejected"
    verified_abuse_type: str  # one of VALID_ABUSE_TYPES

    request_id: Optional[str] = None  # clears this row from pending_requests once decided

    # What the model/SLM said at scoring time -- needed to measure sync with the vendor
    model_predicted_class: Optional[str] = None
    model_confidence: Optional[float] = None
    model_recommendation: Optional[str] = None  # "approve" | "reject" | "request more info"

    # Optional: only needed if this customer/order isn't already in the DB
    age: Optional[int] = None
    account_age_days: Optional[int] = None
    customer_segment: Optional[str] = None
    payment_method: Optional[str] = None
    platform: Optional[str] = None
    device_type: Optional[str] = None
    shipping_carrier: Optional[str] = None
    is_high_value_item: Optional[int] = None
    discount_used: Optional[int] = None
    tracking_number_valid: Optional[int] = None
    address_change_before_delivery: Optional[int] = None
    multiple_accounts_flag: Optional[int] = None
    customer_support_contacts: Optional[int] = None


class VendorDecisionResponse(BaseModel):
    status: str
    return_id: str


@app.post("/vendor-decision", response_model=VendorDecisionResponse)
def vendor_decision_endpoint(payload: VendorDecisionInput):
    if payload.vendor_decision not in VALID_DECISIONS:
        raise HTTPException(status_code=400, detail=f"vendor_decision must be one of {VALID_DECISIONS}")
    if payload.verified_abuse_type not in VALID_ABUSE_TYPES:
        raise HTTPException(status_code=400, detail=f"verified_abuse_type must be one of {VALID_ABUSE_TYPES}")

    try:
        with engine.begin() as conn:
            # 1. Ensure the customer exists (insert with defaults/provided values if new)
            existing_customer = conn.execute(
                text("SELECT 1 FROM customers WHERE customer_id = :cid"),
                {"cid": payload.customer_id}
            ).fetchone()

            if not existing_customer:
                conn.execute(text("""
                    INSERT INTO customers
                        (customer_id, age, account_age_days, customer_segment,
                         country, multiple_accounts_flag, customer_support_contacts)
                    VALUES
                        (:customer_id, :age, :account_age_days, :customer_segment,
                         :country, :multiple_accounts_flag, :customer_support_contacts)
                """), {
                    "customer_id": payload.customer_id,
                    "age": payload.age or CUSTOMER_DEFAULTS["age"],
                    "account_age_days": payload.account_age_days or CUSTOMER_DEFAULTS["account_age_days"],
                    "customer_segment": payload.customer_segment or CUSTOMER_DEFAULTS["customer_segment"],
                    "country": CUSTOMER_DEFAULTS["country"],
                    "multiple_accounts_flag": payload.multiple_accounts_flag or 0,
                    "customer_support_contacts": payload.customer_support_contacts or 0,
                })

            # 2. Ensure the order exists (insert with defaults/provided values if new)
            existing_order = conn.execute(
                text("SELECT 1 FROM orders WHERE order_id = :oid"),
                {"oid": payload.order_id}
            ).fetchone()

            if not existing_order:
                conn.execute(text("""
                    INSERT INTO orders
                        (order_id, customer_id, order_date, product_category, order_amount,
                         discount_used, is_high_value_item, platform, device_type,
                         payment_method, shipping_carrier, tracking_number_valid,
                         address_change_before_delivery)
                    VALUES
                        (:order_id, :customer_id, :order_date, :product_category, :order_amount,
                         :discount_used, :is_high_value_item, :platform, :device_type,
                         :payment_method, :shipping_carrier, :tracking_number_valid,
                         :address_change_before_delivery)
                """), {
                    "order_id": payload.order_id,
                    "customer_id": payload.customer_id,
                    "order_date": payload.order_date,
                    "product_category": payload.product_category,
                    "order_amount": payload.order_amount,
                    "discount_used": payload.discount_used or 0,
                    "is_high_value_item": payload.is_high_value_item or 0,
                    "platform": payload.platform or ORDER_DEFAULTS["platform"],
                    "device_type": payload.device_type or ORDER_DEFAULTS["device_type"],
                    "payment_method": payload.payment_method or ORDER_DEFAULTS["payment_method"],
                    "shipping_carrier": payload.shipping_carrier or ORDER_DEFAULTS["shipping_carrier"],
                    "tracking_number_valid": payload.tracking_number_valid
                        if payload.tracking_number_valid is not None else ORDER_DEFAULTS["tracking_number_valid"],
                    "address_change_before_delivery": payload.address_change_before_delivery or 0,
                })

            # 3. Insert the return record with the vendor's final decision -- this is
            #    the actual feedback-loop write that future get_customer_history() calls will see
            return_id = f"RET{uuid.uuid4().hex[:8].upper()}"
            conn.execute(text("""
                INSERT INTO returns
                    (return_id, order_id, customer_id, return_date, days_to_return,
                     return_reason, refund_amount, item_returned_opened,
                     return_packaging_intact, photo_evidence_provided,
                     refund_to_different_account, vendor_decision, verified_abuse_type,
                     decision_timestamp, model_predicted_class, model_confidence,
                     model_recommendation)
                VALUES
                    (:return_id, :order_id, :customer_id, :return_date, :days_to_return,
                     :return_reason, :refund_amount, :item_returned_opened,
                     :return_packaging_intact, :photo_evidence_provided,
                     :refund_to_different_account, :vendor_decision, :verified_abuse_type,
                     :decision_timestamp, :model_predicted_class, :model_confidence,
                     :model_recommendation)
            """), {
                "return_id": return_id,
                "order_id": payload.order_id,
                "customer_id": payload.customer_id,
                "return_date": date.today().isoformat(),
                "days_to_return": payload.days_to_return or 0,
                "return_reason": payload.return_reason,
                "refund_amount": payload.order_amount,
                "item_returned_opened": payload.item_returned_opened,
                "return_packaging_intact": payload.return_packaging_intact,
                "photo_evidence_provided": payload.photo_evidence_provided,
                "refund_to_different_account": payload.refund_to_different_account,
                "vendor_decision": payload.vendor_decision,
                "verified_abuse_type": payload.verified_abuse_type,
                "decision_timestamp": datetime.now().isoformat(),
                "model_predicted_class": payload.model_predicted_class,
                "model_confidence": payload.model_confidence,
                "model_recommendation": payload.model_recommendation,
            })

            # 4. Remove it from the review queue -- the vendor has handled it
            if payload.request_id:
                conn.execute(
                    text("DELETE FROM pending_requests WHERE request_id = :rid"),
                    {"rid": payload.request_id}
                )

        return VendorDecisionResponse(status="recorded", return_id=return_id)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to record vendor decision: {str(e)}")


# ---------------------------------------------------------------------------
# Sync metrics -- how often does the model/SLM's call match what the vendor,
# with full context, actually decided? Only counts rows where we captured
# the model's prediction at decision time.
# ---------------------------------------------------------------------------
@app.get("/sync-metrics")
def sync_metrics():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT model_predicted_class, model_recommendation, vendor_decision, verified_abuse_type
            FROM returns
            WHERE model_predicted_class IS NOT NULL
        """)).mappings().all()

    total = len(rows)

    CLASS_ORDER = ["Legitimate", "Policy Abuser", "Fraudulent Return", "Wardrobing"]
    class_index = {c: i for i, c in enumerate(CLASS_ORDER)}
    # rows = model's predicted class, cols = vendor's verified label
    vendor_confusion_matrix = [[0 for _ in CLASS_ORDER] for _ in CLASS_ORDER]

    if total == 0:
        return {
            "has_data": False,
            "total_decisions": 0,
            "classification_agreement_pct": None,
            "action_agreement_pct": None,
            "action_agreement_count": 0,
            "breakdown": [],
            "class_order": CLASS_ORDER,
            "vendor_confusion_matrix": vendor_confusion_matrix,
        }

    classification_matches = 0
    action_matches = 0
    action_comparable = 0
    breakdown_counts: dict = {}

    rec_to_decision = {"approve": "approved", "reject": "rejected"}

    for r in rows:
        model_cls = r["model_predicted_class"]
        vendor_cls = r["verified_abuse_type"]

        if model_cls == vendor_cls:
            classification_matches += 1

        rec = (r["model_recommendation"] or "").lower()
        if rec in rec_to_decision:
            action_comparable += 1
            if rec_to_decision[rec] == r["vendor_decision"]:
                action_matches += 1

        key = (model_cls, vendor_cls)
        breakdown_counts[key] = breakdown_counts.get(key, 0) + 1

        # Fill the fixed-order grid; skip gracefully if a class name doesn't match
        # the known set (e.g. legacy rows or a typo'd label)
        if model_cls in class_index and vendor_cls in class_index:
            vendor_confusion_matrix[class_index[model_cls]][class_index[vendor_cls]] += 1

    breakdown = [
        {"model_predicted_class": k[0], "vendor_verified": k[1], "count": v}
        for k, v in sorted(breakdown_counts.items(), key=lambda x: -x[1])
    ]

    return {
        "has_data": True,
        "total_decisions": total,
        "classification_agreement_pct": round(100 * classification_matches / total, 1),
        "action_agreement_pct": round(100 * action_matches / action_comparable, 1) if action_comparable else None,
        "action_agreement_count": action_comparable,
        "breakdown": breakdown,
        "class_order": CLASS_ORDER,
        "vendor_confusion_matrix": vendor_confusion_matrix,
    }