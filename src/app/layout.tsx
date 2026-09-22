import type { Metadata } from "next";
import Link from "next/link";
import { Montserrat } from "next/font/google";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import Providers from "@/components/Providers";
import SearchBox from "@/components/SearchBox";

// Two weights only — Black (900) is deliberately left out of this direction.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Next World Atlas",
  description:
    "A life atlas: progressively experience and learn how the world is organized.",
};

// Brand mark: a drafted suitcase — case, handle, seam, and an orange latch
// sitting on the seam as the active target.
function SuitcaseMark() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">
      <path
        d="M8.75 6.5V5.4A1.4 1.4 0 0 1 10.15 4h3.7a1.4 1.4 0 0 1 1.4 1.4v1.1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="2.75"
        y="6.5"
        width="18.5"
        height="13.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M2.75 11.75h18.5" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path d="M6.6 6.5v13.5M17.4 6.5v13.5" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <rect x="10.4" y="10" width="3.2" height="3.5" fill="var(--marker)" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body>
        <Providers>
          <nav className="nav">
            <Link href="/" className="nav-logo" aria-label="Next World Atlas — home">
              <SuitcaseMark />
              next<span>world</span>atlas
            </Link>
            <div className="nav-links">
              <Link href="/">Home</Link>
              <Link href="/explore">Explore</Link>
              <Link href="/me">My Atlas</Link>
            </div>
            <div className="nav-spacer" />
            <SearchBox />
          </nav>
          {children}
        </Providers>
      </body>
    </html>
  );
}
