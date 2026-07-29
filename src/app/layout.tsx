import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import Providers from "@/components/Providers";
import SearchBox from "@/components/SearchBox";

export const metadata: Metadata = {
  title: "Next World Atlas",
  description:
    "A life atlas: progressively experience and learn how the world is organized.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <nav className="nav">
            <Link href="/" className="nav-logo">
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
