import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Klarpost",
  description: "Understand German official letters, check every deadline against the original, and get reminders on Telegram.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:wght@400;600&family=Atkinson+Hyperlegible+Next:wght@400;700&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="brand" aria-label="Klarpost home">
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <rect x="2" y="7" width="28" height="19" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                <rect x="6" y="12" width="13" height="7" rx="1" fill="var(--marker)" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="25" cy="13" r="2.5" fill="none" stroke="var(--stamp)" strokeWidth="1.5" />
              </svg>
              Klarpost
            </Link>
            <nav className="topnav" aria-label="Main">
              <Link href="/">Letters</Link>
              <Link href="/settings">Reminders</Link>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
