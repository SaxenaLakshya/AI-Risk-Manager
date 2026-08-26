"""
Builds the review prompt for the SLM (Groq) using the nested history structure
from get_history.py, and calls Groq to get a rationale + recommendation.
"""

import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

GROQ_MODEL = "openai/gpt-oss-20b"  # swap to "openai/gpt-oss-120b" if you need stronger reasoning
# Note: llama-3.1-8b-instant and llama-3.3-70b-versatile were deprecated by Groq.
# Check https://console.groq.com/docs/models for the current list if this changes again.


def build_prompt(order: dict, model_result: dict, history: dict) -> str:
    if history.get("is_new_customer"):
        history_section = "This is a NEW customer with no prior order or return history on record."
    else:
        profile = history["profile"]
        stats = history["summary_stats"]
        orders = history["recent_orders"]

        profile_text = (
            f"Age: {profile['age']}, Account age: {profile['account_age_days']} days, "
            f"Segment: {profile['customer_segment']}, "
            f"Multiple accounts flag: {'YES' if profile['multiple_accounts_flag'] else 'No'}, "
            f"Total support contacts (lifetime): {profile['customer_support_contacts']}"
        )

        stats_text = (
            f"Lifetime orders: {stats['total_orders_lifetime']}, "
            f"Lifetime returns: {stats['total_returns_lifetime']} "
            f"({stats['return_rate_pct']}% return rate), "
            f"Flagged as abuse (any type): {stats['flagged_returns_lifetime']}, "
            f"Rejected by vendor previously: {stats['rejected_returns_lifetime']}"
        )

        recent_lines = []
        for o in orders:
            if o.get("return_id"):
                recent_lines.append(
                    f"- {o['order_date']} | {o['product_category']} (${o['order_amount']}) "
                    f"| RETURNED after {o['days_to_return']}d, reason: \"{o['return_reason']}\" "
                    f"| opened: {bool(o['item_returned_opened'])}, packaging intact: {bool(o['return_packaging_intact'])}, "
                    f"photo evidence: {bool(o['photo_evidence_provided'])} "
                    f"| verified as: {o['verified_abuse_type']} | vendor decision: {o['vendor_decision']}"
                )
            else:
                recent_lines.append(
                    f"- {o['order_date']} | {o['product_category']} (${o['order_amount']}) | not returned"
                )
        recent_text = "\n".join(recent_lines) if recent_lines else "No recent orders."

        history_section = f"""CUSTOMER PROFILE:
{profile_text}

LIFETIME STATS:
{stats_text}

RECENT ORDER/RETURN HISTORY (most recent first):
{recent_text}"""

    return f"""You are a return-risk review assistant for an e-commerce merchant.
A machine learning model has flagged the CURRENT ORDER below as UNCERTAIN and needs your judgment
before the vendor makes a final decision.

CURRENT ORDER UNDER REVIEW:
{order}

ML MODEL PREDICTION:
Predicted class: {model_result['predicted_class']}
Confidence: {model_result['confidence']}
Class probabilities: {model_result['class_probabilities']}

{history_section}

Based on the current order, the model's prediction, and this customer's history, provide:
1. RATIONALE: A short rationale (2-3 sentences) for whether this order looks legitimate or risky
2. RECOMMENDATION: One of "approve", "reject", or "request more info"
3. KEY_FACTOR: The single most important risk or trust factor driving your recommendation

Respond in exactly this format, no extra text:
RATIONALE: ...
RECOMMENDATION: ...
KEY_FACTOR: ...
"""


def get_slm_feedback(order: dict, model_result: dict, history: dict) -> dict:
    client = Groq()  # reads GROQ_API_KEY from env

    prompt = build_prompt(order, model_result, history)

    response = client.chat.completions.create(
        model=GROQ_MODEL,
        max_tokens=300,
        temperature=0.2,  # low temperature -- this is a judgment task, not creative writing
        reasoning_effort="low",  # GPT-OSS models: keep reasoning minimal so it doesn't crowd out the answer
        messages=[{"role": "user", "content": prompt}]
    )

    # Debug: inspect the full message object if content looks empty
    message = response.choices[0].message
    raw_text = message.content or ""
    if not raw_text.strip():
        # Some Groq reasoning models put the actual answer in a different field
        raw_text = getattr(message, "reasoning", "") or str(message)

    # --- Parse the structured response into a clean dict ---
    parsed = {"rationale": "", "recommendation": "", "key_factor": "", "raw": raw_text}
    for line in raw_text.splitlines():
        line = line.strip()
        if line.upper().startswith("RATIONALE:"):
            parsed["rationale"] = line.split(":", 1)[1].strip()
        elif line.upper().startswith("RECOMMENDATION:"):
            parsed["recommendation"] = line.split(":", 1)[1].strip().lower()
        elif line.upper().startswith("KEY_FACTOR:"):
            parsed["key_factor"] = line.split(":", 1)[1].strip()

    return parsed


if __name__ == "__main__":
    # Quick manual test using the CUST00004-style uncertain case
    from get_history import get_customer_history

    sample_order = {
        "age": 25, "account_age_days": 407, "customer_segment": "Gold",
        "platform": "Web Browser", "device_type": "Windows PC",
        "payment_method": "Crypto", "product_category": "Jewelry",
        "avg_order_value_usd": 180.0, "refund_amount_requested_usd": 180.0,
        "is_high_value_item": 0, "discount_used": 0, "item_returned_opened": 1,
        "return_packaging_intact": 0, "photo_evidence_provided": 0,
        "tracking_number_valid": 1, "shipping_carrier": "USPS",
        "address_change_before_delivery": 0, "refund_to_different_account": 0,
        "multiple_accounts_flag": 0, "customer_support_contacts": 15,
        "previous_dispute_count": 6, "wishlist_to_cart_time_hrs": 2.0,
    }
    sample_model_result = {
        "predicted_class": "Policy Abuser",
        "confidence": 0.54,
        "class_probabilities": {
            "Legitimate": 0.20, "Policy Abuser": 0.54,
            "Fraudulent Return": 0.15, "Wardrobing": 0.11
        }
    }

    history = get_customer_history("CUST00004")
    feedback = get_slm_feedback(sample_order, sample_model_result, history)

    import json
    print(json.dumps(feedback, indent=2))