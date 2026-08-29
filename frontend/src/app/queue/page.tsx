"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    scoreOrder,
    submitVendorDecision,
    type OrderInput,
    type ScoreResponse,
} from "@/lib/api";

const ABUSE_TYPES = ["Legitimate", "Policy Abuser", "Fraudulent Return", "Wardrobing"];

type IncomingRequest = OrderInput & {
    order_id: string;
    order_date: string;
    days_to_return: number;
};

// Simulated "requests that just arrived" -- swap for a real incoming-orders
// feed later. These reuse cases already validated earlier in the pipeline.
const INCOMING_REQUESTS: IncomingRequest[] = [
    {
        order_id: "ORD-DEMO-001",
        order_date: "2026-08-20",
        days_to_return: 4,
        customer_id: "CUST00004",
        age: 25, account_age_days: 407, customer_segment: "Gold",
        platform: "Web Browser", device_type: "Windows PC", payment_method: "Crypto",
        product_category: "Jewelry", avg_order_value_usd: 180.0, refund_amount_requested_usd: 180.0,
        is_high_value_item: 0, discount_used: 0, item_returned_opened: 1,
        return_packaging_intact: 0, photo_evidence_provided: 0, tracking_number_valid: 1,
        shipping_carrier: "USPS", address_change_before_delivery: 0, refund_to_different_account: 0,
        multiple_accounts_flag: 0, customer_support_contacts: 15, previous_dispute_count: 6,
        wishlist_to_cart_time_hrs: 2.0, return_reason: "Not as described",
    },
    {
        order_id: "ORD-DEMO-002",
        order_date: "2026-08-22",
        days_to_return: 2,
        customer_id: "CUST00004",
        age: 29, account_age_days: 300, customer_segment: "Bronze",
        platform: "Mobile App", device_type: "iPhone", payment_method: "Credit Card",
        product_category: "Clothing", avg_order_value_usd: 210.0, refund_amount_requested_usd: 210.0,
        is_high_value_item: 0, discount_used: 0, item_returned_opened: 1,
        return_packaging_intact: 1, photo_evidence_provided: 0, tracking_number_valid: 1,
        shipping_carrier: "USPS", address_change_before_delivery: 0, refund_to_different_account: 0,
        multiple_accounts_flag: 0, customer_support_contacts: 0, previous_dispute_count: 0,
        wishlist_to_cart_time_hrs: 3.0, return_reason: "Changed mind",
    },
    {
        order_id: "ORD-DEMO-003",
        order_date: "2026-08-24",
        days_to_return: 1,
        customer_id: "CUST88888",
        age: 20, account_age_days: 2, customer_segment: "New",
        platform: "Mobile App", device_type: "Android", payment_method: "Crypto",
        product_category: "Electronics", avg_order_value_usd: 1350.0, refund_amount_requested_usd: 1350.0,
        is_high_value_item: 1, discount_used: 1, item_returned_opened: 1,
        return_packaging_intact: 0, photo_evidence_provided: 0, tracking_number_valid: 0,
        shipping_carrier: "OnTrac", address_change_before_delivery: 1, refund_to_different_account: 1,
        multiple_accounts_flag: 1, customer_support_contacts: 6, previous_dispute_count: 3,
        wishlist_to_cart_time_hrs: 0.1, return_reason: "Item defective",
    },
    {
        order_id: "ORD-DEMO-004",
        order_date: "2026-08-25",
        days_to_return: 6,
        customer_id: "CUST00003",
        age: 33, account_age_days: 250, customer_segment: "Silver",
        platform: "Web Browser", device_type: "Windows PC", payment_method: "Buy Now Pay Later",
        product_category: "Electronics", avg_order_value_usd: 420.0, refund_amount_requested_usd: 420.0,
        is_high_value_item: 1, discount_used: 0, item_returned_opened: 1,
        return_packaging_intact: 1, photo_evidence_provided: 0, tracking_number_valid: 1,
        shipping_carrier: "UPS", address_change_before_delivery: 0, refund_to_different_account: 0,
        multiple_accounts_flag: 0, customer_support_contacts: 1, previous_dispute_count: 0,
        wishlist_to_cart_time_hrs: 15.0, return_reason: "Not as described",
    },
];

type QueueItem = {
    request: IncomingRequest;
    score: ScoreResponse | null;
    loading: boolean;
    error: string | null;
    decided: boolean;
    decidedAs: "approved" | "rejected" | null;
    returnId: string | null;
    selectedLabel: string;
    submitting: boolean;
};

function classTone(cls: string): "trust" | "amber" | "risk" {
    if (cls === "Legitimate") return "trust";
    if (cls === "Fraudulent Return") return "risk";
    return "amber";
}

function toneColor(tone: "trust" | "amber" | "risk") {
    if (tone === "trust") return "var(--trust-green)";
    if (tone === "risk") return "var(--risk-red)";
    return "var(--amber)";
}

export default function QueuePage() {
    const [items, setItems] = useState<QueueItem[]>(
        INCOMING_REQUESTS.map((r) => ({
            request: r,
            score: null,
            loading: true,
            error: null,
            decided: false,
            decidedAs: null,
            returnId: null,
            selectedLabel: "Legitimate",
            submitting: false,
        }))
    );

    useEffect(() => {
        items.forEach((item, idx) => {
            if (item.score || item.error) return;
            const { order_id, order_date, days_to_return, ...orderInput } = item.request;
            scoreOrder(orderInput)
                .then((score) => {
                    setItems((prev) => {
                        const next = [...prev];
                        next[idx] = {
                            ...next[idx],
                            score,
                            loading: false,
                            selectedLabel: score.predicted_class,
                        };
                        return next;
                    });
                })
                .catch((e) => {
                    setItems((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], loading: false, error: e.message };
                        return next;
                    });
                });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleDecision(idx: number, decision: "approved" | "rejected") {
        const item = items[idx];
        setItems((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], submitting: true };
            return next;
        });

        try {
            const { order_id, order_date, days_to_return, customer_id, product_category,
                avg_order_value_usd, return_reason, item_returned_opened, return_packaging_intact,
                photo_evidence_provided, refund_to_different_account, age, account_age_days,
                customer_segment, payment_method, platform, device_type, shipping_carrier,
                is_high_value_item, discount_used, tracking_number_valid,
                address_change_before_delivery, multiple_accounts_flag, customer_support_contacts,
            } = item.request;

            const result = await submitVendorDecision({
                order_id, customer_id, order_date, product_category,
                order_amount: avg_order_value_usd, return_reason, days_to_return,
                item_returned_opened, return_packaging_intact, photo_evidence_provided,
                refund_to_different_account, vendor_decision: decision,
                verified_abuse_type: item.selectedLabel,
                model_predicted_class: item.score?.predicted_class,
                model_confidence: item.score?.confidence,
                model_recommendation: item.score?.slm_recommendation || undefined,
                age, account_age_days, customer_segment, payment_method, platform,
                device_type, shipping_carrier, is_high_value_item, discount_used,
                tracking_number_valid, address_change_before_delivery,
                multiple_accounts_flag, customer_support_contacts,
            });

            setItems((prev) => {
                const next = [...prev];
                next[idx] = {
                    ...next[idx],
                    submitting: false,
                    decided: true,
                    decidedAs: decision,
                    returnId: result.return_id,
                };
                return next;
            });
        } catch (e) {
            setItems((prev) => {
                const next = [...prev];
                next[idx] = { ...next[idx], submitting: false, error: (e as Error).message };
                return next;
            });
        }
    }

    const pending = items.filter((i) => !i.decided);
    const decided = items.filter((i) => i.decided);

    return (
        <main className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
            <Link
                href="/"
                className="font-mono text-xs text-[color:var(--text-muted)] hover:text-[color:var(--amber)]"
            >
                ← back
            </Link>

            <h1 className="font-display text-3xl font-medium mt-4 mb-1">Review queue</h1>
            <p className="text-sm text-[color:var(--text-muted)] mb-10">
                {pending.length} pending · {decided.length} decided this session
            </p>

            <div className="flex flex-col gap-4">
                {pending.map((item, i) => {
                    const idx = items.indexOf(item);
                    return <QueueCard key={item.request.order_id} item={item} onDecide={(d) => handleDecision(idx, d)} onLabelChange={(label) => {
                        setItems((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], selectedLabel: label };
                            return next;
                        });
                    }} />;
                })}
            </div>

            {decided.length > 0 && (
                <div className="mt-14">
                    <h2 className="font-display text-sm uppercase tracking-widest text-[color:var(--text-muted)] mb-4">
                        Decided this session
                    </h2>
                    <div className="flex flex-col gap-2">
                        {decided.map((item) => (
                            <div
                                key={item.request.order_id}
                                className="border border-[color:var(--line)] bg-[color:var(--surface)] rounded-md px-4 py-3 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="font-mono text-xs text-[color:var(--text-muted)]">
                                        {item.request.order_id}
                                    </span>
                                    <span className="text-sm">{item.request.customer_id}</span>
                                    <span
                                        className="font-mono text-xs px-2 py-0.5 rounded-full border"
                                        style={{
                                            color: item.decidedAs === "approved" ? "var(--trust-green)" : "var(--risk-red)",
                                            borderColor: item.decidedAs === "approved" ? "var(--trust-green)" : "var(--risk-red)",
                                        }}
                                    >
                                        {item.decidedAs}
                                    </span>
                                    <span className="text-xs text-[color:var(--text-muted)]">
                                        labeled {item.selectedLabel}
                                    </span>
                                </div>
                                <span className="font-mono text-[11px] text-[color:var(--text-muted)]">
                                    → {item.returnId}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {pending.length === 0 && decided.length === 0 && (
                <p className="text-sm text-[color:var(--text-muted)]">No requests in the queue.</p>
            )}
        </main>
    );
}

function QueueCard({
    item,
    onDecide,
    onLabelChange,
}: {
    item: QueueItem;
    onDecide: (d: "approved" | "rejected") => void;
    onLabelChange: (label: string) => void;
}) {
    const { request, score, loading, error, submitting } = item;

    return (
        <div className="border border-[color:var(--line)] bg-[color:var(--surface)] rounded-lg p-5">
            {/* Order summary row */}
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[color:var(--text-muted)]">
                            {request.order_id}
                        </span>
                        <span className="text-xs text-[color:var(--text-muted)]">·</span>
                        <span className="font-mono text-xs text-[color:var(--text-muted)]">
                            {request.customer_id}
                        </span>
                    </div>
                    <div className="font-display text-lg mt-1">
                        {request.product_category} — ${request.avg_order_value_usd.toFixed(2)}
                    </div>
                    <div className="text-xs text-[color:var(--text-muted)] mt-0.5">
                        {request.payment_method} · returned after {request.days_to_return}d ·
                        &ldquo;{request.return_reason}&rdquo;
                    </div>
                </div>

                {score && (
                    <span
                        className="font-mono text-xs border rounded-full px-3 py-1 whitespace-nowrap"
                        style={{
                            color: toneColor(classTone(score.predicted_class)),
                            borderColor: `${toneColor(classTone(score.predicted_class))}66`,
                        }}
                    >
                        {score.predicted_class} · {(score.confidence * 100).toFixed(0)}%
                    </span>
                )}
            </div>

            {loading && (
                <div className="font-mono text-xs text-[color:var(--text-muted)]">scoring…</div>
            )}

            {error && (
                <div className="text-xs text-[color:var(--risk-red)]">Error: {error}</div>
            )}

            {score && (
                <>
                    {/* Class probability bars */}
                    <div className="flex gap-1 mb-4">
                        {Object.entries(score.class_probabilities).map(([cls, p]) => (
                            <div key={cls} className="flex-1">
                                <div className="h-1.5 rounded-full bg-[color:var(--ink)] overflow-hidden">
                                    <div
                                        className="h-full rounded-full"
                                        style={{
                                            width: `${p * 100}%`,
                                            background: toneColor(classTone(cls)),
                                        }}
                                    />
                                </div>
                                <div className="font-mono text-[10px] text-[color:var(--text-muted)] mt-1">
                                    {cls} {(p * 100).toFixed(0)}%
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Explanation panel */}
                    <div className="border border-[color:var(--line)] rounded-md px-4 py-3 mb-4 bg-[color:var(--ink)]">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                                {score.explanation_source === "slm" ? "SLM review" : "Automated summary"}
                            </span>
                            {score.is_uncertain && (
                                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border border-[color:var(--amber)]/50 text-[color:var(--amber)]">
                                    flagged for review
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-[color:var(--text)] leading-relaxed">
                            {score.slm_rationale}
                        </p>
                        {score.slm_key_factor && (
                            <p className="text-xs text-[color:var(--text-muted)] mt-2">
                                Key factor: {score.slm_key_factor}
                            </p>
                        )}
                        {score.slm_recommendation && (
                            <p className="text-xs text-[color:var(--text-muted)] mt-1">
                                Suggested action:{" "}
                                <span className="text-[color:var(--text)]">{score.slm_recommendation}</span>
                            </p>
                        )}
                    </div>

                    {/* Vendor decision controls */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                        <label className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
                            Label:
                            <select
                                value={item.selectedLabel}
                                onChange={(e) => onLabelChange(e.target.value)}
                                disabled={submitting}
                                className="bg-[color:var(--surface-raised)] border border-[color:var(--line)] rounded px-2 py-1 text-[color:var(--text)] font-mono text-xs"
                            >
                                {ABUSE_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <button
                            onClick={() => onDecide("approved")}
                            disabled={submitting}
                            className="font-mono text-xs px-4 py-1.5 rounded-md border border-[color:var(--trust-green)]/50 text-[color:var(--trust-green)] hover:bg-[color:var(--trust-green)]/10 disabled:opacity-40 transition-colors"
                        >
                            {submitting ? "…" : "Approve"}
                        </button>
                        <button
                            onClick={() => onDecide("rejected")}
                            disabled={submitting}
                            className="font-mono text-xs px-4 py-1.5 rounded-md border border-[color:var(--risk-red)]/50 text-[color:var(--risk-red)] hover:bg-[color:var(--risk-red)]/10 disabled:opacity-40 transition-colors"
                        >
                            {submitting ? "…" : "Reject"}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}