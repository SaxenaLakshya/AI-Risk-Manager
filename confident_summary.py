"""
Generates a cheap, templated explanation for CONFIDENT model predictions,
so vendors always get a readable summary without paying for an SLM call
on every single order. Only genuinely uncertain cases go to the full SLM review.
"""


def build_confident_summary(order: dict, model_result: dict) -> dict:
    """
    Returns a dict shaped like the SLM feedback output
    (rationale, recommendation, key_factor) but generated from simple rules,
    not an LLM call.
    """
    predicted_class = model_result["predicted_class"]
    confidence = model_result["confidence"]

    # Collect the risk/trust signals actually present in this order
    risk_flags = []
    trust_flags = []

    if order.get("payment_method") == "Crypto":
        risk_flags.append("crypto payment")
    if order.get("address_change_before_delivery"):
        risk_flags.append("address changed before delivery")
    if order.get("refund_to_different_account"):
        risk_flags.append("refund requested to a different account")
    if order.get("multiple_accounts_flag"):
        risk_flags.append("linked to multiple accounts")
    if not order.get("photo_evidence_provided", 1):
        risk_flags.append("no photo evidence provided")
    if not order.get("return_packaging_intact", 1):
        risk_flags.append("packaging not intact")
    if not order.get("tracking_number_valid", 1):
        risk_flags.append("invalid tracking number")

    if order.get("photo_evidence_provided"):
        trust_flags.append("photo evidence provided")
    if order.get("return_packaging_intact"):
        trust_flags.append("packaging intact")
    if order.get("tracking_number_valid"):
        trust_flags.append("valid tracking number")
    if order.get("account_age_days", 0) > 365:
        trust_flags.append("established account (1+ year)")

    if predicted_class == "Legitimate":
        recommendation = "approve"
        if trust_flags:
            rationale = (
                f"Model confidently predicted Legitimate ({confidence:.0%} confidence). "
                f"Supporting signals: {', '.join(trust_flags)}."
            )
        else:
            rationale = f"Model confidently predicted Legitimate ({confidence:.0%} confidence). No notable risk signals present."
        key_factor = trust_flags[0] if trust_flags else "Overall low-risk feature profile"
    else:
        recommendation = "reject" if confidence > 0.75 else "request more info"
        if risk_flags:
            rationale = (
                f"Model confidently predicted {predicted_class} ({confidence:.0%} confidence). "
                f"Risk signals: {', '.join(risk_flags)}."
            )
        else:
            rationale = f"Model confidently predicted {predicted_class} ({confidence:.0%} confidence) based on overall order pattern."
        key_factor = risk_flags[0] if risk_flags else f"Strong statistical pattern match to {predicted_class}"

    return {
        "rationale": rationale,
        "recommendation": recommendation,
        "key_factor": key_factor,
        "source": "rule_based",  # distinguish from SLM-generated summaries in your UI/logs
    }
