"""
Retrieves a customer's historical context from Postgres (Supabase) for the
uncertain-case SLM review layer.
"""

import os
from dotenv import load_dotenv
from urllib.parse import quote_plus
from sqlalchemy import create_engine, text
import pandas as pd

# ---------------------------------------------------------------------------
# Connection (reads from env vars -- set these in .env locally, and in your
# hosting platform's environment/secrets settings when deployed)
# ---------------------------------------------------------------------------
load_dotenv()

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = quote_plus(os.getenv("DB_PASSWORD"))
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(DATABASE_URL, pool_pre_ping=True)


def get_customer_history(customer_id: str, limit: int = 5) -> dict:
    """
    Returns:
        {
            "profile": {...},        # from CUSTOMERS
            "recent_orders": [...],  # last N orders, with return info if any
            "summary_stats": {...}   # computed aggregates for quick reference
        }
    """
    query = text("""
        SELECT
            o.order_id,
            o.order_date,
            o.product_category,
            o.order_amount,
            o.is_high_value_item,
            o.payment_method,
            o.address_change_before_delivery,
            r.return_id,
            r.return_date,
            r.days_to_return,
            r.return_reason,
            r.item_returned_opened,
            r.return_packaging_intact,
            r.photo_evidence_provided,
            r.refund_to_different_account,
            r.vendor_decision,
            r.verified_abuse_type
        FROM orders o
        LEFT JOIN returns r ON o.order_id = r.order_id
        WHERE o.customer_id = :customer_id
        ORDER BY o.order_date DESC
        LIMIT :limit
    """)

    profile_query = text("""
        SELECT age, account_age_days, customer_segment, country,
               multiple_accounts_flag, customer_support_contacts
        FROM customers
        WHERE customer_id = :customer_id
    """)

    with engine.connect() as conn:
        recent_orders = pd.read_sql(query, conn, params={"customer_id": customer_id, "limit": limit})
        profile = pd.read_sql(profile_query, conn, params={"customer_id": customer_id})

    if profile.empty:
        return {"profile": None, "recent_orders": [], "summary_stats": {}, "is_new_customer": True}

    profile_dict = profile.iloc[0].to_dict()

    # --- Summary stats computed from full history, not just the `limit` window ---
    stats_query = text("""
        SELECT
            COUNT(o.order_id) AS total_orders,
            COUNT(r.return_id) AS total_returns,
            COALESCE(SUM(CASE WHEN r.verified_abuse_type != 'Legitimate' THEN 1 ELSE 0 END), 0) AS flagged_returns,
            COALESCE(SUM(CASE WHEN r.vendor_decision = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected_returns
        FROM orders o
        LEFT JOIN returns r ON o.order_id = r.order_id
        WHERE o.customer_id = :customer_id
    """)
    with engine.connect() as conn:
        stats = pd.read_sql(stats_query, conn, params={"customer_id": customer_id}).iloc[0].to_dict()

    total_orders = stats["total_orders"] or 1  # avoid div by zero
    summary_stats = {
        "total_orders_lifetime": int(stats["total_orders"]),
        "total_returns_lifetime": int(stats["total_returns"]),
        "return_rate_pct": round(100 * stats["total_returns"] / total_orders, 1),
        "flagged_returns_lifetime": int(stats["flagged_returns"]),
        "rejected_returns_lifetime": int(stats["rejected_returns"]),
    }

    return {
        "profile": profile_dict,
        "recent_orders": recent_orders.to_dict(orient="records"),
        "summary_stats": summary_stats,
        "is_new_customer": False,
    }


if __name__ == "__main__":
    # Quick manual test -- replace with a real customer_id from your data
    result = get_customer_history("CUST00004")
    import json
    print(json.dumps(result, indent=2, default=str))
