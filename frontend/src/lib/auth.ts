// Lightweight demo-grade vendor gate. Checks a single shared password
// client-side and remembers the session in sessionStorage.
//
// NOTE: This is NOT real security -- the password is exposed in the client
// bundle via NEXT_PUBLIC_VENDOR_PASSWORD. Fine for a buildathon demo where
// the goal is "keep casual visitors out of the review queue," not to guard
// sensitive data. For production, replace with a real backend-checked login
// (e.g. POST /vendor-login validated server-side, returning a signed token).

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export const VENDOR_SESSION_KEY = "riskos_vendor_auth";

export function checkVendorPassword(input: string): boolean {
    const expected = process.env.NEXT_PUBLIC_VENDOR_PASSWORD || "riskos-demo";
    return input === expected;
}

export function setVendorAuthenticated() {
    if (typeof window !== "undefined") {
        sessionStorage.setItem(VENDOR_SESSION_KEY, "true");
    }
}

export function clearVendorAuth() {
    if (typeof window !== "undefined") {
        sessionStorage.removeItem(VENDOR_SESSION_KEY);
    }
}

export function isVendorAuthenticated(): boolean {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(VENDOR_SESSION_KEY) === "true";
}

/**
 * Drop this into any vendor-only page. Redirects to /login if not
 * authenticated. Returns { checked, authed } -- render nothing until
 * checked is true to avoid a flash of protected content.
 */
export function useRequireVendorAuth() {
    const router = useRouter();
    const [checked, setChecked] = useState(false);
    const [authed, setAuthed] = useState(false);

    useEffect(() => {
        const ok = isVendorAuthenticated();
        if (!ok) {
            router.replace("/login");
        } else {
            setAuthed(true);
        }
        setChecked(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { checked, authed };
}