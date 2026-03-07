import type { Metadata } from "next";
import "@radix-ui/themes/styles.css";
import AppThemeProvider from "@/components/AppThemeProvider";
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[var(--color-background)] font-sans text-white antialiased">
        <AppThemeProvider>
          <Header />
          <main className="relative">
            <div className="grid-bg pointer-events-none fixed inset-0" />
            {/* Radial glow behind content */}
            <div className="pointer-events-none fixed left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(34,211,238,0.04),transparent_70%)]" />
            <div className="relative">{children}</div>
          </main>
        </AppThemeProvider>
      </body>
    </html>
  );
}
