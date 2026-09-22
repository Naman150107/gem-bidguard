import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/app/sidebar";
import { getCurrentOfficer } from "@/lib/officer";

export const metadata: Metadata = {
  title: "VendorPulse AI — Bid Compliance Verification",
  description:
    "AI-powered decision-support platform for verifying bidder compliance in GeM procurement (SIH 2026 PS 26100).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const officer = getCurrentOfficer();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen">
          <Sidebar officerName={officer.name} />
          <main className="min-w-0 flex-1 overflow-x-hidden">
            <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
