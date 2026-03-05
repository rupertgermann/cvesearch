import type { Metadata } from "next";
import Header from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "CVE Search - Vulnerability Database",
  description: "Search and explore CVE vulnerability records from the global database. Powered by CIRCL vulnerability-lookup API.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0a0f] font-sans text-white antialiased">
        <Header />
        <main className="relative">
          {/* Subtle grid background */}
          <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:64px_64px]" />
          <div className="relative">{children}</div>
        </main>
      </body>
    </html>
  );
}
