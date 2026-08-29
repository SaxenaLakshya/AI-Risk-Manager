// Shared API client for the Return-Risk Scorer backend.
// Set NEXT_PUBLIC_API_URL in .env.local when deploying; defaults to local dev.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export type OrderInput = {
    customer_id: string;
    age: number;
    account_age_days: number;
    customer_segment: string;
    platform: string;
    device_type: string;
    payment_method: string;
    product_category: string;
    avg_order_value_usd: number;
    refund_amount_requested_usd: number;
    is_high_value_item: number;
    discount_used: number;
    item_returned_opened: number;
    return_packaging_intact: number;
    photo_evidence_provided: number;
    tracking_number_valid: number;
    shipping_carrier: string;
    address_change_before_delivery: number;
    refund_to_different_account: number;
    multiple_accounts_flag: number;
    customer_support_contacts: number;
    previous_dispute_count: number;
    wishlist_to_cart_time_hrs: number;
    return_reason?: string;
};

export type ScoreResponse = {
    predicted_class: string;
    confidence: number;
    is_uncertain: boolean;
    class_probabilities: Record<string, number>;
    slm_rationale: string | null;
    slm_recommendation: string | null;
    slm_key_factor: string | null;
    explanation_source: string | null;
};

export type VendorDecisionInput = {
    order_id: string;
    customer_id: string;
    order_date: string;
    product_category: string;
    order_amount: number;
    return_reason?: string;
    days_to_return?: number;
    item_returned_opened: number;
    return_packaging_intact: number;
    photo_evidence_provided: number;
    refund_to_different_account: number;
    vendor_decision: "approved" | "rejected";
    verified_abuse_type: string;
    model_predicted_class?: string;
    model_confidence?: number;
    model_recommendation?: string;
    age?: number;
    account_age_days?: number;
    customer_segment?: string;
    payment_method?: string;
    platform?: string;
    device_type?: string;
    shipping_carrier?: string;
    is_high_value_item?: number;
    discount_used?: number;
    tracking_number_valid?: number;
    address_change_before_delivery?: number;
    multiple_accounts_flag?: number;
    customer_support_contacts?: number;
};

export async function scoreOrder(order: OrderInput): Promise<ScoreResponse> {
    const res = await fetch(`${API_URL}/score-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`score-order failed: ${res.status} ${err}`);
    }
    return res.json();
}

export async function submitVendorDecision(
    payload: VendorDecisionInput
): Promise<{ status: string; return_id: string }> {
    const res = await fetch(`${API_URL}/vendor-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`vendor-decision failed: ${res.status} ${err}`);
    }
    return res.json();
}

export type SyncMetrics = {
    has_data: boolean;
    total_decisions: number;
    classification_agreement_pct: number | null;
    action_agreement_pct: number | null;
    action_agreement_count: number;
    breakdown: { model_predicted_class: string; vendor_verified: string; count: number }[];
};

export async function getSyncMetrics(): Promise<SyncMetrics> {
    const res = await fetch(`${API_URL}/sync-metrics`, { cache: "no-store" });
    if (!res.ok) {
        throw new Error(`sync-metrics failed: ${res.status}`);
    }
    return res.json();
}