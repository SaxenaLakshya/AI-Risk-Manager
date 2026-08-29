"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { checkVendorPassword, setVendorAuthenticated } from "@/lib/auth";

export default function LoginPage() {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (checkVendorPassword(password)) {
            setVendorAuthenticated();
            router.push("/queue");
        } else {
            setError("Incorrect password.");
        }
    }

    return (
        <main className="min-h-screen flex items-center justify-center px-6">
            <div className="w-full max-w-sm">
                <div className="mb-8 text-center">
                    <span className="font-display text-lg font-medium">
                        Risk<span className="text-[color:var(--text-muted)]">/</span>OS
                    </span>
                    <p className="text-sm text-[color:var(--text-muted)] mt-2">
                        Vendor access
                    </p>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="border border-[color:var(--line)] bg-[color:var(--surface)] rounded-lg p-6"
                >
                    <label className="block mb-4">
                        <span className="text-xs font-mono text-[color:var(--text-muted)] uppercase tracking-wider">
                            Password
                        </span>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setError(null);
                            }}
                            autoFocus
                            className="w-full mt-2 bg-[color:var(--surface-raised)] border border-[color:var(--line)] rounded-md px-3 py-2 text-sm text-[color:var(--text)] focus:outline-none focus:border-[color:var(--amber)]/60"
                            placeholder="••••••••"
                        />
                    </label>

                    {error && (
                        <p className="text-xs text-[color:var(--risk-red)] mb-4">{error}</p>
                    )}

                    <button
                        type="submit"
                        className="w-full font-mono text-sm px-4 py-2 rounded-md bg-[color:var(--amber)] text-[color:var(--ink)] font-medium hover:opacity-90 transition-opacity"
                    >
                        Enter
                    </button>
                </form>

                <p className="text-xs text-[color:var(--text-muted)] text-center mt-6 leading-relaxed">
                    Don&apos;t have vendor access?{" "}
                    <Link
                        href="/submit-request"
                        className="text-[color:var(--amber)] hover:underline"
                    >
                        Submit a return request instead →
                    </Link>
                </p>
            </div>
        </main>
    );
}