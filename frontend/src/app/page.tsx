"use client";

import Link from "next/link";

const PIPELINE_STAGES = [
    { label: "Order", detail: "Order or return submitted" },
    { label: "Model", detail: "XGBoost + AdaBoost ensemble" },
    { label: "History check", detail: "Return-rate & prior-flag lookup" },
    { label: "SLM review", detail: "Contextual second opinion" },
    { label: "Vendor", detail: "Final human decision" },
];

const METRICS = [
    { label: "Precision (macro)", value: "0.98" },
    { label: "Recall (macro)", value: "0.97" },
    { label: "PR-AUC", value: "0.99" },
    { label: "Accuracy", value: "0.99" },
];

const CLASS_CHIPS = [
    { label: "Legitimate", tone: "trust" },
    { label: "Policy Abuser", tone: "amber" },
    { label: "Fraudulent Return", tone: "risk" },
    { label: "Wardrobing", tone: "amber" },
] as const;

function chipClasses(tone: "trust" | "amber" | "risk") {
    switch (tone) {
        case "trust":
            return "border-[color:var(--trust-green)]/40 text-[color:var(--trust-green)]";
        case "risk":
            return "border-[color:var(--risk-red)]/40 text-[color:var(--risk-red)]";
        default:
            return "border-[color:var(--amber)]/40 text-[color:var(--amber)]";
    }
}

export default function Home() {
    return (
        <main className="min-h-screen">
            {/* Status bar */}
            <div className="border-b border-[color:var(--line)] px-6 py-3 flex items-center justify-between">
                <span className="font-mono text-xs tracking-widest text-[color:var(--text-muted)] uppercase">
                    Risk/OS
                </span>
                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--trust-green)]" />
                    <span className="font-mono text-xs text-[color:var(--text-muted)]">
                        pipeline live
                    </span>
                </div>
            </div>

            {/* Hero */}
            <section className="px-6 pt-16 pb-12 max-w-4xl">
                <h1 className="font-display text-4xl md:text-5xl font-medium leading-tight text-[color:var(--text)]">
                    Return-risk scoring
                    <br />
                    for merchants who&apos;d rather ask twice
                    <br />
                    than eat the chargeback.
                </h1>
                <p className="mt-5 text-[color:var(--text-muted)] max-w-xl leading-relaxed">
                    Every order is scored on arrival. Confident calls clear instantly.
                    Anything ambiguous — by the model&apos;s own uncertainty, or by a
                    customer&apos;s history — gets a second opinion before it reaches you.
                </p>
            </section>

            {/* Signature: pipeline strip */}
            <section className="px-6 pb-16">
                <div className="relative border border-[color:var(--line)] bg-[color:var(--surface)] rounded-lg px-6 py-8 overflow-hidden">
                    <div className="absolute top-0 left-0 h-[2px] w-full bg-[color:var(--line)]">
                        <span className="pulse-dot absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[color:var(--amber)] shadow-[0_0_8px_var(--amber)]" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mt-4">
                        {PIPELINE_STAGES.map((stage, i) => (
                            <div key={stage.label} className="flex flex-col gap-1">
                                <span className="font-mono text-[11px] text-[color:var(--text-muted)]">
                                    {String(i + 1).padStart(2, "0")}
                                </span>
                                <span className="font-display text-sm font-medium text-[color:var(--text)]">
                                    {stage.label}
                                </span>
                                <span className="text-xs text-[color:var(--text-muted)] leading-snug">
                                    {stage.detail}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Model snapshot */}
            <section className="px-6 pb-16">
                <div className="flex items-baseline justify-between mb-4">
                    <h2 className="font-display text-sm uppercase tracking-widest text-[color:var(--text-muted)]">
                        Model snapshot — held-out test set
                    </h2>
                    <Link
                        href="/performance"
                        className="font-mono text-xs text-[color:var(--amber)] hover:underline"
                    >
                        full report →
                    </Link>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {METRICS.map((m) => (
                        <div
                            key={m.label}
                            className="border border-[color:var(--line)] bg-[color:var(--surface)] rounded-md px-4 py-4"
                        >
                            <div className="font-mono text-2xl text-[color:var(--text)]">
                                {m.value}
                            </div>
                            <div className="text-xs text-[color:var(--text-muted)] mt-1">
                                {m.label}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2">
                    {CLASS_CHIPS.map((c) => (
                        <span
                            key={c.label}
                            className={`font-mono text-xs border rounded-full px-3 py-1 ${chipClasses(
                                c.tone
                            )}`}
                        >
                            {c.label}
                        </span>
                    ))}
                </div>
            </section>

            {/* Entry points */}
            <section className="px-6 pb-20 grid md:grid-cols-2 gap-4 max-w-4xl">
                <Link
                    href="/queue"
                    className="group border border-[color:var(--line)] bg-[color:var(--surface)] hover:border-[color:var(--amber)]/50 transition-colors rounded-lg p-6"
                >
                    <div className="flex items-center justify-between">
                        <span className="font-display text-lg text-[color:var(--text)]">
                            Review queue
                        </span>
                        <span className="font-mono text-xs text-[color:var(--amber)] opacity-0 group-hover:opacity-100 transition-opacity">
                            open →
                        </span>
                    </div>
                    <p className="text-sm text-[color:var(--text-muted)] mt-2">
                        Orders flagged by the model or by customer history, waiting on a
                        decision.
                    </p>
                </Link>

                <Link
                    href="/performance"
                    className="group border border-[color:var(--line)] bg-[color:var(--surface)] hover:border-[color:var(--amber)]/50 transition-colors rounded-lg p-6"
                >
                    <div className="flex items-center justify-between">
                        <span className="font-display text-lg text-[color:var(--text)]">
                            Performance detail
                        </span>
                        <span className="font-mono text-xs text-[color:var(--amber)] opacity-0 group-hover:opacity-100 transition-opacity">
                            open →
                        </span>
                    </div>
                    <p className="text-sm text-[color:var(--text-muted)] mt-2">
                        Confusion matrix, per-class precision/recall, and cost-weighted
                        threshold analysis.
                    </p>
                </Link>
            </section>
        </main>
    );
}