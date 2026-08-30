"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { submitOrder, type OrderInput, type SubmitOrderResponse } from "@/lib/api";

const CUSTOMER_SEGMENTS = ["New", "Bronze", "Silver", "Gold", "Platinum"];
const PLATFORMS = ["Web Browser", "Tablet App", "Mobile App"];
const DEVICES = ["iPhone", "MacBook", "iPad", "Windows PC", "Android"];
const PAYMENTS = ["Crypto", "PayPal", "Debit Card", "Buy Now Pay Later", "Credit Card", "Gift Card"];
const CATEGORIES = ["Toys", "Books", "Clothing", "Home & Kitchen", "Electronics", "Shoes", "Beauty", "Furniture", "Sports", "Tools", "Jewelry", "Grocery"];
const CARRIERS = ["OnTrac", "FedEx", "USPS", "UPS", "DHL"];

const DEFAULT_FORM: OrderInput = {
    customer_id: "",
    age: 30,
    account_age_days: 90,
    customer_segment: "New",
    platform: "Web Browser",
    device_type: "Windows PC",
    payment_method: "Credit Card",
    product_category: "Clothing",
    avg_order_value_usd: 50,
    refund_amount_requested_usd: 50,
    is_high_value_item: 0,
    discount_used: 0,
    item_returned_opened: 0,
    return_packaging_intact: 1,
    photo_evidence_provided: 1,
    tracking_number_valid: 1,
    shipping_carrier: "USPS",
    address_change_before_delivery: 0,
    refund_to_different_account: 0,
    multiple_accounts_flag: 0,
    customer_support_contacts: 0,
    previous_dispute_count: 0,
    wishlist_to_cart_time_hrs: 24,
    return_reason: "",
};

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="text-xs font-mono text-[color:var(--text-muted)] uppercase tracking-wider">
                {label}
            </span>
            <div className="mt-1.5">{children}</div>
        </label>
    );
}

const inputClass =
    "w-full bg-[color:var(--surface-raised)] border border-[color:var(--line)] rounded-md px-3 py-2 text-sm text-[color:var(--text)] focus:outline-none focus:border-[color:var(--amber)]/60";

export default function SubmitRequestPage() {
    const [form, setForm] = useState<OrderInput>(DEFAULT_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<SubmitOrderResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    function update<K extends keyof OrderInput>(key: K, value: OrderInput[K]) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!form.customer_id.trim()) {
            setError("Please enter a customer ID.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const score = await submitOrder(form);
            setResult(score);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSubmitting(false);
        }
    }

    if (result) {
        const statusIsClear = !result.is_uncertain;
        return (
            <main className="min-h-screen px-6 py-16 flex justify-center">
                <div className="w-full max-w-md">
                    <div className="border border-[color:var(--line)] bg-[color:var(--surface)] rounded-lg p-6 text-center">
                        <span
                            className="inline-block w-2 h-2 rounded-full mb-4"
                            style={{
                                background: statusIsClear ? "var(--trust-green)" : "var(--amber)",
                            }}
                        />
                        <h1 className="font-display text-xl mb-2">
                            {statusIsClear ? "Request processed" : "Request received"}
                        </h1>
                        <p className="text-sm text-[color:var(--text-muted)] leading-relaxed mb-5">
                            {statusIsClear
                                ? "Your return has been automatically reviewed."
                                : "Your return needs a closer look and has been sent to our team for manual review."}
                        </p>

                        <div className="text-left border-t border-[color:var(--line)] pt-4 mt-2">
                            <p className="text-xs text-[color:var(--text-muted)] font-mono mb-1">
                                Reference
                            </p>
                            <p className="text-sm mb-4">{form.customer_id}</p>

                            <p className="text-xs text-[color:var(--text-muted)] font-mono mb-1">
                                Status
                            </p>
                            <p className="text-sm mb-4">
                                {result.slm_recommendation === "approve" && "Approved"}
                                {result.slm_recommendation === "reject" && "Declined"}
                                {result.slm_recommendation === "request more info" && "More information requested"}
                                {!result.slm_recommendation && "Pending review"}
                            </p>

                            {result.slm_rationale && (
                                <>
                                    <p className="text-xs text-[color:var(--text-muted)] font-mono mb-1">
                                        Note
                                    </p>
                                    <p className="text-sm text-[color:var(--text-muted)] leading-relaxed">
                                        {result.slm_rationale}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-between items-center mt-4">
                        <button
                            onClick={() => {
                                setResult(null);
                                setForm(DEFAULT_FORM);
                            }}
                            className="font-mono text-xs text-[color:var(--text-muted)] hover:text-[color:var(--amber)]"
                        >
                            ← submit another
                        </button>
                        <Link
                            href="/login"
                            className="font-mono text-xs text-[color:var(--text-muted)] hover:text-[color:var(--amber)]"
                        >
                            vendor login →
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen px-6 py-12 max-w-2xl mx-auto">
            <h1 className="font-display text-2xl font-medium mb-1">
                Submit a return request
            </h1>
            <p className="text-sm text-[color:var(--text-muted)] mb-8">
                We&apos;ll review it right away — most requests get an instant answer.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div className="border border-[color:var(--line)] bg-[color:var(--surface)] rounded-lg p-5">
                    <h2 className="font-mono text-xs uppercase tracking-widest text-[color:var(--text-muted)] mb-4">
                        Your details
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Customer ID">
                            <input
                                className={inputClass}
                                value={form.customer_id}
                                onChange={(e) => update("customer_id", e.target.value)}
                                placeholder="e.g. CUST00004"
                            />
                        </Field>
                        <Field label="Age">
                            <input
                                type="number"
                                className={inputClass}
                                value={form.age}
                                onChange={(e) => update("age", Number(e.target.value))}
                            />
                        </Field>
                        <Field label="Customer segment">
                            <select
                                className={inputClass}
                                value={form.customer_segment}
                                onChange={(e) => update("customer_segment", e.target.value)}
                            >
                                {CUSTOMER_SEGMENTS.map((s) => (
                                    <option key={s}>{s}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Account age (days)">
                            <input
                                type="number"
                                className={inputClass}
                                value={form.account_age_days}
                                onChange={(e) => update("account_age_days", Number(e.target.value))}
                            />
                        </Field>
                    </div>
                </div>

                <div className="border border-[color:var(--line)] bg-[color:var(--surface)] rounded-lg p-5">
                    <h2 className="font-mono text-xs uppercase tracking-widest text-[color:var(--text-muted)] mb-4">
                        Order details
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Product category">
                            <select
                                className={inputClass}
                                value={form.product_category}
                                onChange={(e) => update("product_category", e.target.value)}
                            >
                                {CATEGORIES.map((c) => (
                                    <option key={c}>{c}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Order value (USD)">
                            <input
                                type="number"
                                className={inputClass}
                                value={form.avg_order_value_usd}
                                onChange={(e) => {
                                    const v = Number(e.target.value);
                                    update("avg_order_value_usd", v);
                                    update("refund_amount_requested_usd", v);
                                }}
                            />
                        </Field>
                        <Field label="Payment method">
                            <select
                                className={inputClass}
                                value={form.payment_method}
                                onChange={(e) => update("payment_method", e.target.value)}
                            >
                                {PAYMENTS.map((p) => (
                                    <option key={p}>{p}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Shipping carrier">
                            <select
                                className={inputClass}
                                value={form.shipping_carrier}
                                onChange={(e) => update("shipping_carrier", e.target.value)}
                            >
                                {CARRIERS.map((c) => (
                                    <option key={c}>{c}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Platform">
                            <select
                                className={inputClass}
                                value={form.platform}
                                onChange={(e) => update("platform", e.target.value)}
                            >
                                {PLATFORMS.map((p) => (
                                    <option key={p}>{p}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Device">
                            <select
                                className={inputClass}
                                value={form.device_type}
                                onChange={(e) => update("device_type", e.target.value)}
                            >
                                {DEVICES.map((d) => (
                                    <option key={d}>{d}</option>
                                ))}
                            </select>
                        </Field>
                    </div>
                </div>

                <div className="border border-[color:var(--line)] bg-[color:var(--surface)] rounded-lg p-5">
                    <h2 className="font-mono text-xs uppercase tracking-widest text-[color:var(--text-muted)] mb-4">
                        Return details
                    </h2>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <Field label="Reason for return">
                            <input
                                className={inputClass}
                                value={form.return_reason}
                                onChange={(e) => update("return_reason", e.target.value)}
                                placeholder="e.g. Not as described"
                            />
                        </Field>
                        <Field label="Customer support contacts (lifetime)">
                            <input
                                type="number"
                                className={inputClass}
                                value={form.customer_support_contacts}
                                onChange={(e) => update("customer_support_contacts", Number(e.target.value))}
                            />
                        </Field>
                        <Field label="Previous dispute count">
                            <input
                                type="number"
                                className={inputClass}
                                value={form.previous_dispute_count}
                                onChange={(e) => update("previous_dispute_count", Number(e.target.value))}
                            />
                        </Field>
                        <Field label="Wishlist to cart time (hrs)">
                            <input
                                type="number"
                                className={inputClass}
                                value={form.wishlist_to_cart_time_hrs}
                                onChange={(e) => update("wishlist_to_cart_time_hrs", Number(e.target.value))}
                            />
                        </Field>
                    </div>
                    <div className="flex flex-wrap gap-5">
                        {[
                            ["is_high_value_item", "High-value item"],
                            ["discount_used", "Discount was used"],
                            ["item_returned_opened", "Item was opened"],
                            ["return_packaging_intact", "Packaging intact"],
                            ["photo_evidence_provided", "Photo evidence provided"],
                            ["tracking_number_valid", "Valid tracking number"],
                            ["address_change_before_delivery", "Address changed before delivery"],
                            ["refund_to_different_account", "Refund to a different account"],
                            ["multiple_accounts_flag", "Linked to multiple accounts"],
                        ].map(([key, label]) => (
                            <label key={key} className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
                                <input
                                    type="checkbox"
                                    checked={Boolean(form[key as keyof OrderInput])}
                                    onChange={(e) => update(key as keyof OrderInput, (e.target.checked ? 1 : 0) as never)}
                                />
                                {label}
                            </label>
                        ))}
                    </div>
                </div>

                {error && <p className="text-xs text-[color:var(--risk-red)]">{error}</p>}

                <button
                    type="submit"
                    disabled={submitting}
                    className="font-mono text-sm px-5 py-2.5 rounded-md bg-[color:var(--amber)] text-[color:var(--ink)] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 self-start"
                >
                    {submitting ? "Submitting…" : "Submit request"}
                </button>
            </form>
        </main>
    );
}