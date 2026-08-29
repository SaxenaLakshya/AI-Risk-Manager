import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const display = Space_Grotesk({
    subsets: ["latin"],
    weight: ["500", "700"],
    variable: "--font-display",
});

const body = IBM_Plex_Sans({
    subsets: ["latin"],
    weight: ["400", "500", "600"],
    variable: "--font-body",
});

const mono = IBM_Plex_Mono({
    subsets: ["latin"],
    weight: ["400", "500"],
    variable: "--font-mono",
});

export const metadata: Metadata = {
    title: "Risk/OS — Return-Risk Scorer",
    description: "The operating system for merchant return-risk decisions.",
};

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
            <body suppressHydrationWarning>
                <Nav />
                {children}
            </body>
        </html>
    );
}