"use client";

import { useEffect, useState } from "react";
import { getSyncMetrics, type SyncMetrics } from "@/lib/api";
import { useRequireVendorAuth } from "@/lib/auth";

// --- REAL numbers, from your ensemble (XGBoost + AdaBoost) classification_report ---
const CLASS_METRICS = [
    { name: "Legitimate", precision: 0.99, recall: 1.0, f1: 1.0, support: 8412 },
    { name: "Policy Abuser", precision: 0.99, recall: 0.95, f1: 0.97, support: 1439 },
    { name: "Fraudulent Return", precision: 0.99, recall: 0.97, f1: 0.98, support: 1222 },
    { name: "Wardrobing", precision: 0.94, recall: 0.97, f1: 0.95, support: 927 },
];

const OVERALL = {
    accuracy: 0.99,
    macroPrecision: 0.98,
    macroRecall: 0.97,
    macroF1: 0.97,
    weightedF1: 0.99,
    support: 12000,
};

// --- PLACEHOLDER: replace with your real sklearn.metrics.confusion_matrix() output ---
// Run: confusion_matrix(y_test, y_pred_ensemble) and paste the 4x4 array here,
// in the same row/column order as CLASS_METRICS above.
const CONFUSION_MATRIX_IS_REAL = false;
const CONFUSION_MATRIX: number[][] | null = null;

// --- PLACEHOLDER: fill in once you've run your cost-weighted threshold sweep ---
const COST_ANALYSIS_IS_REAL = false;

function pct(n: number) {
    return `${(n * 100).toFixed(0)}%`;
}

export default function PerformancePage() {
    const { checked, authed } = useRequireVendorAuth();

    const [sync, setSync] = useState<SyncMetrics | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [syncLoading, setSyncLoading] = useState(true);

    useEffect(() => {
        getSyncMetrics()
            .then(setSync)
            .catch((e) => setSyncError(e.message))
            .finally(() => setSyncLoading(false));
    }, []);

    if (!checked || !authed) return null;

    return (
        <main className="min-h-screen px-6 py-10 max-w-5xl mx-auto">
            <h1 className="font-display text-3xl font-medium mb-1">
                Model performance
            </h1>
            <p className="text-sm text-[color:var(--text-muted)] mb-10">
                Held-out test set — {OVERALL.support.toLocaleString()} orders. Ensemble
                of XGBoost + AdaBoost, soft-voted.
            </p>

            {/* Overall summary strip */}
            <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-12">
                <SummaryCard label="Accuracy" value={pct(OVERALL.accuracy)} />
                <SummaryCard label="Precision (macro)" value={pct(OVERALL.macroPrecision)} />
                <SummaryCard label="Recall (macro)" value={pct(OVERALL.macroRecall)} />
                <SummaryCard label="F1 (macro)" value={pct(OVERALL.macroF1)} />
                <SummaryCard label="F1 (weighted)" value={pct(OVERALL.weightedF1)} />
            </section>

            {/* Per-class table */}
            <section className="mb-12">
                <h2 className="font-display text-sm uppercase tracking-widest text-[color:var(--text-muted)] mb-4">
                    Per-class breakdown
                </h2>
                <div className="border border-[color:var(--line)] rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-[color:var(--surface)] text-[color:var(--text-muted)] font-mono text-xs uppercase">
                                <th className="text-left px-4 py-3">Class</th>
                                <th className="text-right px-4 py-3">Precision</th>
                                <th className="text-right px-4 py-3">Recall</th>
                                <th className="text-right px-4 py-3">F1</th>
                                <th className="text-right px-4 py-3">Support</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono">
                            {CLASS_METRICS.map((row, i) => (
                                <tr
                                    key={row.name}
                                    className={i % 2 === 0 ? "bg-[color:var(--ink)]" : "bg-[color:var(--surface)]"}
                                >
                                    <td className="px-4 py-3 font-body">{row.name}</td>
                                    <td className="text-right px-4 py-3">{row.precision.toFixed(2)}</td>
                                    <td className="text-right px-4 py-3">{row.recall.toFixed(2)}</td>
                                    <td className="text-right px-4 py-3">{row.f1.toFixed(2)}</td>
                                    <td className="text-right px-4 py-3 text-[color:var(--text-muted)]">
                                        {row.support.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-[color:var(--text-muted)] mt-2">
                    Wardrobing has the smallest support (927) and lowest precision
                    (0.94) — worth watching as the highest-uncertainty class.
                </p>
            </section>

            {/* Confusion matrix */}
            <section className="mb-12">
                <h2 className="font-display text-sm uppercase tracking-widest text-[color:var(--text-muted)] mb-4">
                    Confusion matrix
                </h2>
                {CONFUSION_MATRIX_IS_REAL && CONFUSION_MATRIX ? (
                    <ConfusionGrid matrix={CONFUSION_MATRIX} labels={CLASS_METRICS.map((c) => c.name)} />
                ) : (
                    <PlaceholderNotice>
                        Not wired up yet. Run{" "}
                        <code className="font-mono text-[color:var(--amber)]">
                            confusion_matrix(y_test, y_pred_ensemble)
                        </code>{" "}
                        in your notebook and paste the 4×4 array into{" "}
                        <code className="font-mono">CONFUSION_MATRIX</code> in this file
                        (set <code className="font-mono">CONFUSION_MATRIX_IS_REAL = true</code>).
                    </PlaceholderNotice>
                )}
            </section>

            {/* Cost-weighted analysis */}
            <section className="mb-12">
                <h2 className="font-display text-sm uppercase tracking-widest text-[color:var(--text-muted)] mb-4">
                    Cost-weighted threshold analysis
                </h2>
                {COST_ANALYSIS_IS_REAL ? (
                    <div />
                ) : (
                    <PlaceholderNotice>
                        Not computed yet. This is the section your track&apos;s
                        &ldquo;honest metrics including false-positive cost&rdquo; bar is
                        asking for — assign a cost to a false positive (manual review
                        overhead) and a false negative (absorbed fraud/return loss), then
                        sweep your decision threshold to find the operating point that
                        minimizes expected cost per 1,000 orders. Report that table here
                        once run.
                    </PlaceholderNotice>
                )}
            </section>
            {/* Model vs Vendor sync */}
            <section className="mb-12">
                <h2 className="font-display text-sm uppercase tracking-widest text-[color:var(--text-muted)] mb-4">
                    Model ↔ vendor sync
                </h2>
                <p className="text-xs text-[color:var(--text-muted)] mb-4 leading-relaxed max-w-2xl">
                    How often does the model/SLM&apos;s call at scoring time match what
                    the vendor, with full context, actually decided? Measured only on
                    cases where a vendor has recorded a real decision.
                </p>

                {syncLoading && (
                    <div className="font-mono text-xs text-[color:var(--text-muted)]">
                        loading…
                    </div>
                )}

                {!syncLoading && syncError && (
                    <PlaceholderNotice>
                        Could not reach the backend (
                        <code className="font-mono">{syncError}</code>). Make sure the API
                        is running and <code className="font-mono">/sync-metrics</code> is
                        deployed.
                    </PlaceholderNotice>
                )}

                {!syncLoading && !syncError && sync && !sync.has_data && (
                    <PlaceholderNotice>
                        No vendor decisions recorded yet. Once vendors start
                        approving/rejecting orders in the review queue, this section will
                        show how often the model&apos;s classification and the SLM&apos;s
                        recommendation matched the vendor&apos;s final call.
                    </PlaceholderNotice>
                )}

                {!syncLoading && !syncError && sync && sync.has_data && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                            <SummaryCard
                                label="Classification match"
                                value={`${sync.classification_agreement_pct}%`}
                            />
                            <SummaryCard
                                label="Recommended action match"
                                value={
                                    sync.action_agreement_pct !== null
                                        ? `${sync.action_agreement_pct}%`
                                        : "—"
                                }
                            />
                            <SummaryCard
                                label="Decisions compared"
                                value={String(sync.total_decisions)}
                            />
                        </div>

                        {sync.vendor_confusion_matrix && (
                            <div className="mb-6">
                                <p className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] mb-2">
                                    Rows = model predicted, columns = vendor verified
                                </p>
                                <ConfusionGrid
                                    matrix={sync.vendor_confusion_matrix}
                                    labels={sync.class_order}
                                />
                            </div>
                        )}

                        <div className="border border-[color:var(--line)] rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-[color:var(--surface)] text-[color:var(--text-muted)] font-mono text-xs uppercase">
                                        <th className="text-left px-4 py-3">Model said</th>
                                        <th className="text-left px-4 py-3">Vendor verified as</th>
                                        <th className="text-right px-4 py-3">Count</th>
                                    </tr>
                                </thead>
                                <tbody className="font-mono">
                                    {sync.breakdown.map((row, i) => {
                                        const agree = row.model_predicted_class === row.vendor_verified;
                                        return (
                                            <tr
                                                key={i}
                                                className={i % 2 === 0 ? "bg-[color:var(--ink)]" : "bg-[color:var(--surface)]"}
                                            >
                                                <td className="px-4 py-3 font-body">{row.model_predicted_class}</td>
                                                <td
                                                    className="px-4 py-3 font-body"
                                                    style={{ color: agree ? "var(--trust-green)" : "var(--risk-red)" }}
                                                >
                                                    {row.vendor_verified}
                                                </td>
                                                <td className="text-right px-4 py-3">{row.count}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>
        </main>
    );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="border border-[color:var(--line)] bg-[color:var(--surface)] rounded-md px-4 py-4">
            <div className="font-mono text-2xl">{value}</div>
            <div className="text-xs text-[color:var(--text-muted)] mt-1">{label}</div>
        </div>
    );
}

function PlaceholderNotice({ children }: { children: React.ReactNode }) {
    return (
        <div className="border border-dashed border-[color:var(--amber)]/40 bg-[color:var(--amber-dim)]/20 rounded-lg px-5 py-4 text-sm text-[color:var(--text-muted)] leading-relaxed">
            {children}
        </div>
    );
}

function ConfusionGrid({
    matrix,
    labels,
}: {
    matrix: number[][];
    labels: string[];
}) {
    const max = Math.max(...matrix.flat());
    return (
        <div className="overflow-x-auto">
            <table className="font-mono text-sm border-collapse">
                <thead>
                    <tr>
                        <th className="p-2" />
                        {labels.map((l) => (
                            <th
                                key={l}
                                className="p-2 text-[color:var(--text-muted)] text-xs font-normal max-w-[80px]"
                            >
                                {l}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {matrix.map((row, i) => (
                        <tr key={i}>
                            <td className="p-2 text-[color:var(--text-muted)] text-xs text-right pr-3">
                                {labels[i]}
                            </td>
                            {row.map((val, j) => {
                                const intensity = val / max;
                                const isDiagonal = i === j;
                                return (
                                    <td
                                        key={j}
                                        className="p-2 text-center border border-[color:var(--line)]"
                                        style={{
                                            background: isDiagonal
                                                ? `rgba(79, 165, 122, ${0.15 + intensity * 0.5})`
                                                : `rgba(217, 79, 79, ${intensity * 0.4})`,
                                        }}
                                    >
                                        {val}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}