// layout.tsx – Root HTML shell for the AuraStay reservation app.
// Sets global metadata, loads web fonts, and wraps all pages in
// a consistent <html> / <body> structure.

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Load Geist Sans for body text (Vercel's modern variable font)
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Load Geist Mono for code / numeric values
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Page-level metadata surfaced by Next.js in <head>
export const metadata: Metadata = {
  title: "AuraStay – Hotel Room Reservation System",
  description:
    "An intelligent hotel reservation engine that optimally assigns up to 5 rooms per booking, " +
    "minimising total travel time based on floor layout and lift proximity.",
  keywords: ["hotel", "reservation", "room booking", "travel time", "Next.js"],
};

/**
 * RootLayout wraps every page in the app.
 * Font CSS variables are injected here so globals.css can reference them.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
