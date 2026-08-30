"use client";

import { useEffect, useState } from "react";
import {
    submitVendorDecision,
    getPendingRequests,
    type PendingRequest,
} from "@/lib/api";
import { useRequireVendorAuth } from "@/lib/auth";

const ABUSE_TYPES = ["Legitimate", "Policy Abuser", "Fraudulent Return", "Wardrobing"];

type QueueItem = {
    pending: PendingRequest;
    decided: boolean;
    decidedAs: "approved" | "rejected" | null;
    returnId: string | null;
    selectedLabel: string;
    submitting: boolean;
    error: string | null;
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

function formatTimestamp(iso: string) {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

export default function QueuePage() {
    const { checked, authed } = useRequireVendorAuth();

    const [items, setItems] = useState<QueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!authed) return;
        getPendingRequests()
            .then((rows) => {
                setItems(
                    rows.map((p) => ({
                        pending: p,
                        decided: false,
                        decidedAs: null,
                        returnId: null,
                        selectedLabel: p.predicted_class,
                        submitting: false,
                        error: null,
                    }))
                );
            })
            .catch((e) => setLoadError(e.message))
            .finally(() => setLoading(false));
    }, [authed]);

    async function handleDecision(idx: number, decision: "approved" | "rejected") {
        const item = items[idx];
        setItems((prev) => {
            const next = [...prev];
            next[idx] = { ...next[idx], submitting: true };
            return next;
        });

        const order = item.pending.order_json;

        try {
            const result = await submitVendorDecision({
                order_id: item.pending.request_id,
                customer_id: order.customer_id,
                order_date: item.pending.submitted_at.split("T")[0],
                product_category: order.product_category,
                order_amount: order.avg_order_value_usd,
                return_reason: order.return_reason,
                days_to_return: 0,
                item_returned_opened: order.item_returned_opened,
                return_packaging_intact: order.return_packaging_intact,
                photo_evidence_provided: order.photo_evidence_provided,
                refund_to_different_account: order.refund_to_different_account,
                vendor_decision: decision,
                verified_abuse_type: item.selectedLabel,
                request_id: item.pending.request_id,
                model_predicted_class: item.pending.predicted_class,
                model_confidence: item.pending.confidence,
                model_recommendation: item.pending.slm_recommendation || undefined,
                age: order.age,
                account_age_days: order.account_age_days,
                customer_segment: order.customer_segment,
                payment_method: order.payment_method,
                platform: order.platform,
                device_type: order.device_type,
                shipping_carrier: order.shipping_carrier,
                is_high_value_item: order.is_high_value_item,
                discount_used: order.discount_used,
                tracking_number_valid: order.tracking_number_valid,
                address_change_before_delivery: order.address_change_before_delivery,
                multiple_accounts_flag: order.multiple_accounts_flag,
                customer_support_contacts: order.customer_support_contacts,
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

    if (!checked || !authed) return null;

    return (
        <main className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
            <h1 className="font-display text-3xl font-medium mb-1">Review queue</h1>
            <p className="text-sm text-[color:var(--text-muted)] mb-10">
                {loading ? "loading…" : `${pending.length} pending · ${decided.length} decided this session`}
            </p>

            {loadError && (
                <p className="text-xs text-[color:var(--risk-red)] mb-6">
                    Could not load pending requests: {loadError}
                </p>
            )}

            <div className="flex flex-col gap-4">
                {pending.map((item) => {
                    const idx = items.indexOf(item);
                    return (
                        <QueueCard
                            key={item.pending.request_id}
                            item={item}
                            onDecide={(d) => handleDecision(idx, d)}
                            onLabelChange={(label) => {
                                setItems((prev) => {
                                    const next = [...prev];
                                    next[idx] = { ...next[idx], selectedLabel: label };
                                    return next;
                                });
                            }}
                        />
                    );
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
                                key={item.pending.request_id}
                                className="border border-[color:var(--line)] bg-[color:var(--surface)] rounded-md px-4 py-3 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="font-mono text-xs text-[color:var(--text-muted)]">
                                        {item.pending.request_id}
                                    </span>
                                    <span className="text-sm">{item.pending.customer_id}</span>
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

            {!loading && pending.length === 0 && decided.length === 0 && (
                <p className="text-sm text-[color:var(--text-muted)]">
                    No requests in the queue. Submit one at{" "}
                    <span className="font-mono text-[color:var(--amber)]">/submit-request</span>{" "}
                    with some risk signals to see it land here.
                </p>
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
    const { pending, submitting, error } = item;
    const order = pending.order_json;

    return (
        <div className="border border-[color:var(--line)] bg-[color:var(--surface)] rounded-lg p-5">
            {/* Order summary row */}
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[color:var(--text-muted)]">
                            {pending.request_id}
                        </span>
                        <span className="text-xs text-[color:var(--text-muted)]">·</span>
                        <span className="font-mono text-xs text-[color:var(--text-muted)]">
                            {pending.customer_id}
                        </span>
                    </div>
                    <div className="font-display text-lg mt-1">
                        {order.product_category} — ${order.avg_order_value_usd.toFixed(2)}
                    </div>
                    <div className="text-xs text-[color:var(--text-muted)] mt-0.5">
                        {order.payment_method} · submitted {formatTimestamp(pending.submitted_at)}
                        {order.return_reason ? ` · "${order.return_reason}"` : ""}
                    </div>
                </div>

                <span
                    className="font-mono text-xs border rounded-full px-3 py-1 whitespace-nowrap"
                    style={{
                        color: toneColor(classTone(pending.predicted_class)),
                        borderColor: `${toneColor(classTone(pending.predicted_class))}66`,
                    }}
                >
                    {pending.predicted_class} · {(pending.confidence * 100).toFixed(0)}%
                </span>
            </div>

            {error && <div className="text-xs text-[color:var(--risk-red)] mb-3">Error: {error}</div>}

            {/* Class probability bars */}
            <div className="flex gap-1 mb-4">
                {Object.entries(pending.class_probabilities).map(([cls, p]) => (
                    <div key={cls} className="flex-1">
                        <div className="h-1.5 rounded-full bg-[color:var(--ink)] overflow-hidden">
                            <div
                                className="h-full rounded-full"
                                style={{ width: `${p * 100}%`, background: toneColor(classTone(cls)) }}
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
                        {pending.explanation_source === "slm" ? "SLM review" : "Automated summary"}
                    </span>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border border-[color:var(--amber)]/50 text-[color:var(--amber)]">
                        flagged for review
                    </span>
                </div>
                <p className="text-sm text-[color:var(--text)] leading-relaxed">
                    {pending.slm_rationale}
                </p>
                {pending.slm_key_factor && (
                    <p className="text-xs text-[color:var(--text-muted)] mt-2">
                        Key factor: {pending.slm_key_factor}
                    </p>
                )}
                {pending.slm_recommendation && (
                    <p className="text-xs text-[color:var(--text-muted)] mt-1">
                        Suggested action:{" "}
                        <span className="text-[color:var(--text)]">{pending.slm_recommendation}</span>
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
        </div>
    );
}