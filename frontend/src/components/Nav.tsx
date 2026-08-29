"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { isVendorAuthenticated, clearVendorAuth } from "@/lib/auth";
import { useEffect, useState } from "react";

const LINKS = [
    { href: "/", label: "Home" },
    { href: "/queue", label: "Review queue" },
    { href: "/performance", label: "Performance" },
];

export default function Nav() {
    const pathname = usePathname();
    const router = useRouter();
    const [authed, setAuthed] = useState(false);

    useEffect(() => {
        setAuthed(isVendorAuthenticated());
    }, [pathname]);

    function handleLogout() {
        clearVendorAuth();
        setAuthed(false);
        router.push("/");
    }

    return (
        <div className="border-b border-[color:var(--line)] px-6 py-3 flex items-center justify-between sticky top-0 bg-[color:var(--ink)]/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--amber)]" />
                    <span className="font-display text-sm font-medium tracking-tight text-[color:var(--text)]">
                        Risk<span className="text-[color:var(--text-muted)]">/</span>OS
                    </span>
                </Link>

                <nav className="hidden sm:flex items-center gap-6">
                    {LINKS.map((link) => {
                        const active = pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`font-mono text-xs transition-colors ${active
                                        ? "text-[color:var(--amber)]"
                                        : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
                                    }`}
                            >
                                {link.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <div className="flex items-center gap-5">
                <div className="hidden sm:flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--trust-green)]" />
                    <span className="font-mono text-xs text-[color:var(--text-muted)]">
                        pipeline live
                    </span>
                </div>

                {authed ? (
                    <button
                        onClick={handleLogout}
                        className="font-mono text-xs text-[color:var(--text-muted)] hover:text-[color:var(--risk-red)] transition-colors"
                    >
                        log out
                    </button>
                ) : (
                    <Link
                        href="/submit-request"
                        className="font-mono text-xs text-[color:var(--amber)] hover:underline"
                    >
                        submit a return →
                    </Link>
                )}
            </div>
        </div>
    );
}